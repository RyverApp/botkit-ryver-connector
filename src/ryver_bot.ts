import crypto = require('crypto');
import * as ryverApi from './ryver_web_api.js';
import * as utils from './utils.js';
import * as bk from 'botkit';
import express from 'express';

export interface RyverBotkitController extends bk.Controller<RyverSpawnConfiguration, RyverMessage, RyverBot> {
    api: ryverApi.RyverWebApi;
    identity: RyverBotIdentity;

    createWebhookEndpoint(expressWebserver: express.Application, path: string): void;
    handleWebhookPayload(req: botkitExpressRequest, res: express.Response): void;
}

interface botkitExpressRequest extends express.Request { rawBody: string } // property added by botkit.setupWebserver()

export interface RyverBotIdentity extends bk.Identity {
    id: number;
}

export interface RyverBotkitConfiguration extends bk.Configuration {
    api_root?: string;
    bot_token?: string;
    app_secret?: string;
    allowBotOriginatedMessages?: boolean;
}

export interface RyverSpawnConfiguration {
}

export interface RyverBot extends bk.Bot<RyverSpawnConfiguration, RyverMessage> {
    readonly type: string;
    readonly botkit: any;
    readonly config: RyverSpawnConfiguration;
    res: express.Response;
    identity: RyverBotIdentity;

    replyImmediate: (src: RyverIncomingMessage, resp: string | RyverOutgoingMessage, cb?: (err?: Error, res?: any) => void) => void;

    sendDirectChatMessage: (message: string, userId: number, ephemeral: boolean, cb?: ryverApi.ApiCallback) => void;
    sendForumChatMessage: (message: string, forumId: number, ephemeralUserId: number | null, cb?: ryverApi.ApiCallback) => void;
    sendWorkroomChatMessage: (message: string, workroomId: number, ephemeralUserId: number | null, cb?: ryverApi.ApiCallback) => void;
    sendPostComment: (message: string, postId: number, cb?: ryverApi.ApiCallback) => void;
    sendTaskComment: (message: string, taskId: number, cb?: ryverApi.ApiCallback) => void;
}

export interface RyverMessage extends bk.Message {
}

export interface RyverIncomingMessage extends RyverMessage {
    type: string;
    user: string;
    channel: string;
    text: string;
}

export interface RyverOutgoingMessage extends RyverMessage {
    text: string;
    user: string;
    channel: string;
    ephemeral?: boolean;
}

export interface RyverPlatformMessage {
    text: string;
    channel: string;
    ephemeralUserId: number | null;
}

export function ryverBot(Botkit: any, config: RyverBotkitConfiguration): RyverBotkitController {
    const controller = Botkit.core(config);
    const ctrl: RyverBotkitController = controller;
    ctrl.api = new ryverApi.RyverWebApi(config.api_root || '', config.bot_token || '', controller.log);

    controller.defineBot((botkit: any, config: RyverSpawnConfiguration) => {
        var bot: RyverBot = {
            type: 'ryver',
            botkit: botkit,
            config: config || {},
            utterances: botkit.utterances,
        } as any;

        // here is where you make the API call to SEND a message
        // the message object should be in the proper format already
        bot.send = (message: RyverPlatformMessage, cb?) => {
            var c = utils.splitChannel(message.channel);
            if (c) {
                switch (c.prefix) {
                    case utils.channelPrefix.POST:
                        bot.sendPostComment(message.text, c.id, handleApiCallback(cb));
                        return;
                    case utils.channelPrefix.TASK:
                        bot.sendTaskComment(message.text, c.id, handleApiCallback(cb));
                        return;
                    case utils.channelPrefix.FORUM:
                        bot.sendForumChatMessage(message.text, c.id, message.ephemeralUserId, handleApiCallback(cb));
                        return;
                    case utils.channelPrefix.WORKROOM:
                        bot.sendWorkroomChatMessage(message.text, c.id, message.ephemeralUserId, handleApiCallback(cb));
                        return;
                    case utils.channelPrefix.USER:
                        bot.sendDirectChatMessage(message.text, c.id, !!message.ephemeralUserId, handleApiCallback(cb));
                        return;
                }
            }

            botkit.log.info('Sending message not handled. Invalid channel format');
            cb && cb(new Error('Sending message not handled. Invalid channel format'));
        }

        function handleApiCallback(cb?: (err: Error, res?: any) => void): ryverApi.ApiCallback {
            return (err: Error | null) => {
                cb && cb(err!, null);
            };
        }

        // this function takes an incoming message (from a user/convo) and an outgoing message (reply from bot)
        // and ensures that the reply has the appropriate fields to appear as a reply
        bot.reply = (src: RyverIncomingMessage, resp: string | RyverOutgoingMessage, cb) => {
            let msg = constructSendMessage(src, resp);
            bot.say(msg, cb);
        }

        // similar to reply() but this will send an immediate response for commands
        bot.replyImmediate = (src: RyverIncomingMessage, resp: string | RyverOutgoingMessage, cb?) => {
            if (!bot.res) {
                let errMsg = 'There is no response object for this message';
                controller.log.error(errMsg);
                cb && cb(new Error(errMsg))
                return;
            }

            if (!resp) {
                bot.res.end();
                cb && cb();
                return;
            }

            let msg = constructSendMessage(src, resp);
            botkit.middleware.send.run(bot, msg, (err: Error, bot: RyverBot, msg: RyverOutgoingMessage) => {
                if (!err) {
                    bot.res.json(msg);
                }
                cb && cb(err);
            });
        }

        function constructSendMessage(src: RyverIncomingMessage, resp: string | RyverOutgoingMessage): RyverOutgoingMessage {
            if (typeof (resp) === 'string') {
                return {
                    text: resp,
                    channel: src.channel!,
                    user: src.user!,
                }
            }
            (resp as RyverOutgoingMessage).channel = src.channel;
            (resp as RyverOutgoingMessage).user = src.user;

            return resp;
        }

        // this function defines the mechanism by which botkit looks for ongoing conversations
        // probably leave as is!
        bot.findConversation = (message: RyverIncomingMessage, cb) => {
            for (var t = 0; t < botkit.tasks.length; t++) {
                for (var c = 0; c < botkit.tasks[t].convos.length; c++) {
                    if (
                        botkit.tasks[t].convos[c].isActive() &&
                        botkit.tasks[t].convos[c].source_message.user == message.user &&
                        message.channel && botkit.tasks[t].convos[c].source_message.channel == message.channel &&
                        botkit.excludedEvents.indexOf(message.type) == -1 // this type of message should not be included
                    ) {
                        cb(botkit.tasks[t].convos[c]);
                        return;
                    }
                }
            }
            cb();
        };

        bot.sendDirectChatMessage = (message, userId, ephemeral, cb?) => {
            ctrl.api.postDirectChatMessage(message, userId, ephemeral, cb);
        }

        bot.sendForumChatMessage = (message, forumId, ephemeralUserId, cb?) => {
            ctrl.api.postForumChatMessage(message, forumId, ephemeralUserId, cb);
        }

        bot.sendWorkroomChatMessage = (message, workroomId, ephemeralUserId, cb?) => {
            ctrl.api.postWorkroomChatMessage(message, workroomId, ephemeralUserId, cb);
        }

        bot.sendPostComment = (message, postId, cb?) => {
            ctrl.api.postPostComment(message, postId, cb);
        }

        bot.sendTaskComment = (message, taskId, cb?) => {
            ctrl.api.postTaskComment(message, taskId, cb);
        }

        return bot;
    });

    function initialize() {
        ctrl.api.getCurrentUser((err, data) => {
            if (err) {
                controller.log.error('Error fetching Ryver bot identity from API: ' + err);
                return;
            }
            if (!data || !data.d || !data.d.id) {
                controller.log.error('Bot identity response was not in the expected format');
                return;
            }
            ctrl.identity = {
                id: data.d.id,
                name: data.d.username,
                emails: [data.d.emailAddress]
            };
            controller.debug('Identity received: [' + ctrl.identity.id + '] @' + ctrl.identity.name);

            controller.startTicking();
        });
    }

    ctrl.createWebhookEndpoint = (webServer, path) => {
        controller.debug('Configured ryver end-point \'' + path + '\' for receiving webhook events');
        webServer.post(path, (req: any, res: any) => {
            res.status(200);

            // Pass the webhook into be processed
            ctrl.handleWebhookPayload(req, res);
        });
    };

    ctrl.handleWebhookPayload = (req, res) => {
        if (!validateSignature(req)) {
            res.status(401).send('Signature validation failed');
            return;
        }

        if (!ctrl.identity) {
            controller.log.error('Ryver bot identity not set');
            res.send();
            return;
        }

        ctrl.spawn({}, (bot: RyverBot) => {
            controller.ingest(bot, req.body, res);
        });
    };

    function validateSignature(req: botkitExpressRequest) {
        if (controller.config.app_secret) {
            if (!req.rawBody) {
                controller.log.info('The request object did not have a \'rawBody\' property required to validate the signature');
                return false;
            }

            let signature = req.header('x-ryv-signature');
            if (!signature) {
                controller.log.info('Received request without the required \'x-ryv-signature\' header');
                return false;
            }

            let timestamp = req.header('x-ryv-timestamp');
            if (!timestamp) {
                controller.log.info('Received request without the required \'x-ryv-timestamp\' header');
                return false;
            }

            let ts = Date.parse(timestamp);
            if (isNaN(ts)) {
                controller.log.info('Received request with an invalid \'x-ryv-timestamp\' header value of \'' + timestamp + '\'');
                return false;
            }

            // 5 minute timestamp tolerance to cater for server time differences
            if (Math.abs(ts - Date.now()) > 5 * 60 * 1000) {
                controller.log.info('Received request with a \'x-ryv-timestamp\' header outside valid range. Value: \'' + timestamp + '\'');
                return false;
            }

            let hash = crypto.createHmac('sha256', controller.config.app_secret)
                .update(timestamp + ':' + req.rawBody)
                .digest('base64');

            if (hash !== signature) {
                controller.log.info('Received request with an incorrect signature');
                return false;
            }
        }
        return true;
    }

    // setBotIdentity
    controller.middleware.spawn.use((bot: RyverBot, next: Function) => {
        bot.identity = ctrl.identity;
        controller.debug('Bot identity set');
        next();
    });

    // ingestValidateWebhookSignature
    controller.middleware.ingest.use((bot: RyverBot, message: any, res: express.Response, next: Function) => {
        if (message.command) {
            // store response object to support responses from bots for slash commands
            bot.res = res;
        } else {
            // immediately respond to webhooks requests
            res.send();
        }
        next();
    });

    // ingestIgnoreBotOriginatedMessages
    controller.middleware.ingest.use((bot: RyverBot, message: any, res: express.Response, next: Function) => {
        if (!controller.config.allowBotOriginatedMessages) {
            var userId = message.command ? parseInt(message.userId) : message.user.id;
            if (userId === bot.identity.id) {
                controller.debug('Skip bot-originated message');
                bot.res && bot.res.end();
                return;
            }
        }
        next();
    });

    // normalizeCommandType
    controller.middleware.normalize.use((bot: RyverBot, message: any, next: Function) => {
        if (message.command) {
            (message as RyverIncomingMessage).type = 'command';
            controller.debug('normalize command', message.command);
        }
        next();
    });

    // normalizeMessageUser
    controller.middleware.normalize.use((bot: RyverBot, message: any, next: Function) => {
        let userId: string | null = null;
        if (message.type === 'command') {
            userId = message.userId;
        } else {
            userId = message.user && message.user.id || null;
        }
        if (!userId) {
            controller.log.error('Could not obtain user for message');
            return;
        }

        (message as RyverIncomingMessage).user = userId;
        controller.debug('normalize user', message.user);
        next();
    });

    // normalizeMessageChannel
    controller.middleware.normalize.use((bot: RyverBot, message: any, next: Function) => {
        let channel: string | null = null;
        if (message.type === 'command') {
            channel = utils.formatChannelFromEntityType(message.channelType, parseInt(message.channelId));

        } else if (message.type.startsWith('chat_')) {
            channel = utils.formatChannelFromEntityType(message.data.channel.__metadata.type, message.data.channel.id);

        } else if (message.type.startsWith('post_')) {
            channel = utils.formatChannel(utils.channelPrefix.POST, message.data.entityId || message.data.entity.id);

        } else if (message.type.startsWith('postcomment_')) {
            let id = message.data.entity ? message.data.entity.post.id : message.data.post.id;
            channel = utils.formatChannel(utils.channelPrefix.POST, id);

        } else if (message.type.startsWith('task_')) {
            channel = utils.formatChannel(utils.channelPrefix.TASK, message.data.entityId || message.data.entity.id);

        } else if (message.type.startsWith('taskcomment_')) {
            let id = message.data.entity ? message.data.entity.task.id : message.data.task.id;
            channel = utils.formatChannel(utils.channelPrefix.TASK, id);

        }
        if (!channel) {
            controller.log.error('Could not obtain channel for message');
            return;
        }
        (message as RyverIncomingMessage).channel = channel;

        controller.debug('normalize channel', message.channel);

        next();
    });

    // normalizeMessageText
    controller.middleware.normalize.use((bot: RyverBot, message: any, next: Function) => {
        var text: string = '';
        if (message.type === 'command') {
            text = (message.command + ' ' + (message.text || '')).trim();
        } else if (message.data && message.data.entity && message.data.entity.__metadata) {
            switch (message.data.entity.__metadata.type) {
                case 'Entity.ChatMessage':
                    text = message.data.entity.message;
                    break;
                case 'Entity.Post':
                    text = message.data.entity.body;
                    break;
                case 'Entity.Tasks.Task':
                    text = message.data.entity.body;
                    break;
                case 'Entity.Post.Comment':
                    text = message.data.entity.comment;
                    break;
                case 'Entity.Tasks.TaskComment':
                    text = message.data.entity.comment;
                    break;
            }
        }

        (message as RyverIncomingMessage).text = text;

        controller.debug('normalize text', message.text);

        next();
    });

    controller.middleware.categorize.use((bot: RyverBot, message: RyverIncomingMessage, next: Function) => {
        if (message.type === 'chat_created' || message.type === 'postcomment_created' || message.type === 'taskcomment_created') {
            if (message.channel!.charAt(0) === 'U') {
                message.type = 'direct_message';
            } else {
                var username = '@' + bot.identity.name;
                if (new RegExp('^' + username, 'i').test(message.text!)) {
                    message.type = 'direct_mention';
                    message.text = message.text!.substr(username.length + 1);
                } else if (new RegExp('(^|\W+)' + username, 'i').test(message.text!)) {
                    message.type = 'mention';
                } else {
                    message.type = 'ambient';
                }
            }

        }

        controller.debug('categorize type', message.type);

        next();
    });

    // formatStandardMessage
    controller.middleware.format.use((bot: RyverBot, message: RyverOutgoingMessage, platform_message: RyverPlatformMessage, next: Function) => {
        platform_message.text = message.text;
        platform_message.channel = message.channel;
        platform_message.ephemeralUserId = message.ephemeral ? parseInt(message.user) : null;
        next();
    });

    initialize();

    return controller;
}
