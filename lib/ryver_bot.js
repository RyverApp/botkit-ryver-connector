"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var crypto = require("crypto");
var ryverApi = __importStar(require("./ryver_web_api.js"));
var utils = __importStar(require("./utils.js"));
function ryverBot(Botkit, config) {
    var controller = Botkit.core(config);
    var ctrl = controller;
    ctrl.api = new ryverApi.RyverWebApi(config.api_root || '', config.bot_token || '', controller.log);
    controller.defineBot(function (botkit, config) {
        var bot = {
            type: 'ryver',
            botkit: botkit,
            config: config || {},
            utterances: botkit.utterances,
        };
        // here is where you make the API call to SEND a message
        // the message object should be in the proper format already
        bot.send = function (message, cb) {
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
        };
        function handleApiCallback(cb) {
            return function (err) {
                cb && cb(err, null);
            };
        }
        // this function takes an incoming message (from a user/convo) and an outgoing message (reply from bot)
        // and ensures that the reply has the appropriate fields to appear as a reply
        bot.reply = function (src, resp, cb) {
            var msg = constructSendMessage(src, resp);
            bot.say(msg, cb);
        };
        // similar to reply() but this will send an immediate response for commands
        bot.replyImmediate = function (src, resp, cb) {
            if (!bot.res) {
                var errMsg = 'There is no response object for this message';
                controller.log.error(errMsg);
                cb && cb(new Error(errMsg));
                return;
            }
            if (!resp) {
                bot.res.end();
                cb && cb();
                return;
            }
            var msg = constructSendMessage(src, resp);
            botkit.middleware.send.run(bot, msg, function (err, bot, msg) {
                if (!err) {
                    bot.res.json(msg);
                }
                cb && cb(err);
            });
        };
        function constructSendMessage(src, resp) {
            if (typeof (resp) === 'string') {
                return {
                    text: resp,
                    channel: src.channel,
                    user: src.user,
                };
            }
            resp.channel = src.channel;
            resp.user = src.user;
            return resp;
        }
        // this function defines the mechanism by which botkit looks for ongoing conversations
        // probably leave as is!
        bot.findConversation = function (message, cb) {
            for (var t = 0; t < botkit.tasks.length; t++) {
                for (var c = 0; c < botkit.tasks[t].convos.length; c++) {
                    if (botkit.tasks[t].convos[c].isActive() &&
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
        bot.sendDirectChatMessage = function (message, userId, ephemeral, cb) {
            ctrl.api.postDirectChatMessage(message, userId, ephemeral, cb);
        };
        bot.sendForumChatMessage = function (message, forumId, ephemeralUserId, cb) {
            ctrl.api.postForumChatMessage(message, forumId, ephemeralUserId, cb);
        };
        bot.sendWorkroomChatMessage = function (message, workroomId, ephemeralUserId, cb) {
            ctrl.api.postWorkroomChatMessage(message, workroomId, ephemeralUserId, cb);
        };
        bot.sendPostComment = function (message, postId, cb) {
            ctrl.api.postPostComment(message, postId, cb);
        };
        bot.sendTaskComment = function (message, taskId, cb) {
            ctrl.api.postTaskComment(message, taskId, cb);
        };
        return bot;
    });
    function initialize() {
        ctrl.api.getCurrentUser(function (err, data) {
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
    ctrl.createWebhookEndpoint = function (webServer, path) {
        controller.debug('Configured ryver end-point \'' + path + '\' for receiving webhook events');
        webServer.post(path, function (req, res) {
            res.status(200);
            // Pass the webhook into be processed
            ctrl.handleWebhookPayload(req, res);
        });
    };
    ctrl.handleWebhookPayload = function (req, res) {
        if (!validateSignature(req)) {
            res.status(401).send('Signature validation failed');
            return;
        }
        if (!ctrl.identity) {
            controller.log.error('Ryver bot identity not set');
            res.send();
            return;
        }
        ctrl.spawn({}, function (bot) {
            controller.ingest(bot, req.body, res);
        });
    };
    function validateSignature(req) {
        if (controller.config.app_secret) {
            if (!req.rawBody) {
                controller.log.info('The request object did not have a \'rawBody\' property required to validate the signature');
                return false;
            }
            var signature = req.header('x-ryv-signature');
            if (!signature) {
                controller.log.info('Received request without the required \'x-ryv-signature\' header');
                return false;
            }
            var timestamp = req.header('x-ryv-timestamp');
            if (!timestamp) {
                controller.log.info('Received request without the required \'x-ryv-timestamp\' header');
                return false;
            }
            var ts = Date.parse(timestamp);
            if (isNaN(ts)) {
                controller.log.info('Received request with an invalid \'x-ryv-timestamp\' header value of \'' + timestamp + '\'');
                return false;
            }
            // 5 minute timestamp tolerance to cater for server time differences
            if (Math.abs(ts - Date.now()) > 5 * 60 * 1000) {
                controller.log.info('Received request with a \'x-ryv-timestamp\' header outside valid range. Value: \'' + timestamp + '\'');
                return false;
            }
            var hash = crypto.createHmac('sha256', controller.config.app_secret)
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
    controller.middleware.spawn.use(function (bot, next) {
        bot.identity = ctrl.identity;
        controller.debug('Bot identity set');
        next();
    });
    // ingestValidateWebhookSignature
    controller.middleware.ingest.use(function (bot, message, res, next) {
        if (message.command) {
            // store response object to support responses from bots for slash commands
            bot.res = res;
        }
        else {
            // immediately respond to webhooks requests
            res.send();
        }
        next();
    });
    // ingestIgnoreBotOriginatedMessages
    controller.middleware.ingest.use(function (bot, message, res, next) {
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
    controller.middleware.normalize.use(function (bot, message, next) {
        if (message.command) {
            message.type = 'command';
            controller.debug('normalize command', message.command);
        }
        next();
    });
    // normalizeMessageUser
    controller.middleware.normalize.use(function (bot, message, next) {
        var userId = null;
        if (message.type === 'command') {
            userId = message.userId;
        }
        else {
            userId = message.user && message.user.id || null;
        }
        if (!userId) {
            controller.log.error('Could not obtain user for message');
            return;
        }
        message.user = userId;
        controller.debug('normalize user', message.user);
        next();
    });
    // normalizeMessageChannel
    controller.middleware.normalize.use(function (bot, message, next) {
        var channel = null;
        if (message.type === 'command') {
            channel = utils.formatChannelFromEntityType(message.channelType, parseInt(message.channelId));
        }
        else if (message.type.startsWith('chat_')) {
            channel = utils.formatChannelFromEntityType(message.data.channel.__metadata.type, message.data.channel.id);
        }
        else if (message.type.startsWith('post_')) {
            channel = utils.formatChannel(utils.channelPrefix.POST, message.data.entityId || message.data.entity.id);
        }
        else if (message.type.startsWith('postcomment_')) {
            var id = message.data.entity ? message.data.entity.post.id : message.data.post.id;
            channel = utils.formatChannel(utils.channelPrefix.POST, id);
        }
        else if (message.type.startsWith('task_')) {
            channel = utils.formatChannel(utils.channelPrefix.TASK, message.data.entityId || message.data.entity.id);
        }
        else if (message.type.startsWith('taskcomment_')) {
            var id = message.data.entity ? message.data.entity.task.id : message.data.task.id;
            channel = utils.formatChannel(utils.channelPrefix.TASK, id);
        }
        if (!channel) {
            controller.log.error('Could not obtain channel for message');
            return;
        }
        message.channel = channel;
        controller.debug('normalize channel', message.channel);
        next();
    });
    // normalizeMessageText
    controller.middleware.normalize.use(function (bot, message, next) {
        var text = '';
        if (message.type === 'command') {
            text = (message.command + ' ' + (message.text || '')).trim();
        }
        else if (message.data && message.data.entity && message.data.entity.__metadata) {
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
        message.text = text;
        controller.debug('normalize text', message.text);
        next();
    });
    controller.middleware.categorize.use(function (bot, message, next) {
        if (message.type === 'chat_created' || message.type === 'postcomment_created' || message.type === 'taskcomment_created') {
            if (message.channel.charAt(0) === 'U') {
                message.type = 'direct_message';
            }
            else {
                var username = '@' + bot.identity.name;
                if (new RegExp('^' + username, 'i').test(message.text)) {
                    message.type = 'direct_mention';
                    message.text = message.text.substr(username.length + 1);
                }
                else if (new RegExp('(^|\W+)' + username, 'i').test(message.text)) {
                    message.type = 'mention';
                }
                else {
                    message.type = 'ambient';
                }
            }
        }
        controller.debug('categorize type', message.type);
        next();
    });
    // formatStandardMessage
    controller.middleware.format.use(function (bot, message, platform_message, next) {
        platform_message.text = message.text;
        platform_message.channel = message.channel;
        platform_message.ephemeralUserId = message.ephemeral ? parseInt(message.user) : null;
        next();
    });
    initialize();
    return controller;
}
exports.ryverBot = ryverBot;
