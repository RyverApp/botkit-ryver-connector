var crypto = require('crypto');
var ryverWebApi = require(__dirname + '/ryver_web_api.js');
var utils = require(__dirname + '/utils.js');

module.exports = function (Botkit, config) {

    var controller = Botkit.core(config);
    controller.api = ryverWebApi(controller, config);

    controller.defineBot(function (botkit, config) {
        var bot = {
            type: 'ryver',
            botkit: botkit,
            config: config || {},
            utterances: botkit.utterances,
            identity: null,
        }

        // here is where you make the API call to SEND a message
        // the message object should be in the proper format already
        bot.send = function (message, cb) {
            var c = utils.splitChannel(message.channel);
            if (c) {
                switch (c.prefix) {
                    case utils.channelPrefix.POST:
                        bot.sendPostComment(message.text, c.id, cb);
                        return;
                    case utils.channelPrefix.TASK:
                        bot.sendTaskComment(message.text, c.id, cb);
                        return;
                    case utils.channelPrefix.FORUM:
                        bot.sendForumChatMessage(message.text, c.id, message.ephemeralUserId, cb);
                        return;
                    case utils.channelPrefix.WORKROOM:
                        bot.sendWorkroomChatMessage(message.text, c.id, message.ephemeralUserId, cb);
                        return;
                    case utils.channelPrefix.USER:
                        bot.sendDirectChatMessage(message.text, c.id, message.ephemeralUserId, cb);
                        return;
                }
            }

            botkit.log.info('Sending message not handled. Invalid channel format');
            cb && cb();
        }

        // this function takes an incoming message (from a user/convo) and an outgoing message (reply from bot)
        // and ensures that the reply has the appropriate fields to appear as a reply
        bot.reply = function (src, resp, cb) {
            let msg = constructSendMessage(src, resp);
            bot.say(msg, cb);
        }

        // similar to reply() but this will send an immediate response for commands
        bot.replyImmediate = function (src, resp, cb) {
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
            botkit.middleware.send.run(bot, msg, function (err, bot, msg) {
                if (!err) {
                    bot.res.json(msg);
                }
                cb && cb(err);
            });
        }

        function constructSendMessage(src, resp) {
            if (typeof (resp) === 'string') {
                resp = {
                    text: resp
                }
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

        bot.sendDirectChatMessage = function (message, userId, ephemeralUserId, cb) {
            botkit.api.postDirectChatMessage(message, userId, ephemeralUserId, cb);
        }

        bot.sendForumChatMessage = function (message, forumId, ephemeralUserId, cb) {
            botkit.api.postForumChatMessage(message, forumId, ephemeralUserId, cb);
        }

        bot.sendWorkroomChatMessage = function (message, workroomId, ephemeralUserId, cb) {
            botkit.api.postWorkroomChatMessage(message, workroomId, ephemeralUserId, cb);
        }

        bot.sendPostComment = function (message, userId, cb) {
            botkit.api.postPostComment(message, userId, cb);
        }

        bot.sendTaskComment = function (message, userId, cb) {
            botkit.api.postTaskComment(message, userId, cb);
        }

        return bot;
    });

    function initialize() {
        controller.api.getCurrentUser(function (err, data) {
            if (err) {
                controller.log.error('Error fetching Ryver bot identity from API: ' + err);
                return;
            }
            if (!data || !data.d || !data.d.id) {
                controller.log.error('Bot identity response was not in the expected format');
                return;
            }
            controller.identity = { id: data.d.id, username: data.d.username };
            controller.debug('Identity received: [' + controller.identity.id + '] @' + controller.identity.username);

            controller.startTicking();
        });
    }

    controller.createWebhookEndpoint = function (webServer, path) {
        controller.debug('Configured ryver end-point \'' + path + '\' for receiving webhook events');
        webServer.post(path, function (req, res) {
            res.status(200);

            // Pass the webhook into be processed
            controller.handleWebhookPayload(req, res);
        });
    };

    controller.handleWebhookPayload = function (req, res) {
        if (!validateSignature(req, req)) {
            res.status(401).send('Signature validation failed');
            return;
        }

        controller.spawn({}, function (bot) {
            controller.ingest(bot, req.body, res);
        });
    };

    function validateSignature(req) {
        if (controller.config.app_secret && req.rawBody) {
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

    controller.middleware.spawn.use(function setBotIdentity(bot, next) {
        if (!controller.identity) {
            controller.log.error('Ryver bot identity not set');
            return;
        }

        bot.identity = {
            id: controller.identity.id,
            username: controller.identity.username
        };
        controller.debug('Bot identity set');

        next();
    });


    controller.middleware.ingest.use(function ingestValidateWebhookSignature(bot, message, res, next) {
        if (message.command) {
            // store response object to support responses from bots for slash commands
            bot.res = res;
        } else {
            // immediately respond to webhooks requests
            res.send();
        }
        next();
    });

    controller.middleware.ingest.use(function ingestIgnoreBotOriginatedMessages(bot, message, res, next) {
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

    controller.middleware.normalize.use(function normalizeCommandType(bot, message, next) {
        if (message.command) {
            message.type = 'command';
            controller.debug('normalize command', message.command);
        }
        next();
    });

    controller.middleware.normalize.use(function normalizeMessageUser(bot, message, next) {
        if (message.type === 'command') {
            message.user = {
                id: parseInt(message.userId),
                username: message.username,
            }
        }
        message.user = message.user && message.user.id || null;

        controller.debug('normalize user', message.user);

        next();
    });

    controller.middleware.normalize.use(function normalizeMessageChannel(bot, message, next) {
        var channel = null;

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
        message.channel = channel;

        controller.debug('normalize channel', message.channel);

        next();
    });

    controller.middleware.normalize.use(function normalizeMessageText(bot, message, next) {
        var text = null;
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

        message.text = text;

        controller.debug('normalize text', message.text);

        next();
    });

    controller.middleware.categorize.use(function (bot, message, next) {
        if (message.type === 'chat_created' || message.type === 'postcomment_created' || message.type === 'taskcomment_created') {
            if (message.channel.charAt(0) === 'U') {
                message.type = 'direct_message';
            } else {
                var username = '@' + bot.identity.username;
                if (new RegExp('^' + username, 'i').test(message.text)) {
                    message.type = 'direct_mention';
                    message.text = message.text.substr(username.length + 1);
                } else if (new RegExp('(^|\W+)' + username, 'i').test(message.text)) {
                    message.type = 'mention';
                } else {
                    message.type = 'ambient';
                }
            }
        }

        controller.debug('categorize type', message.type);

        next();
    });

    controller.middleware.format.use(function formatStandardMessage(bot, message, platform_message, next) {
        platform_message.channel = message.channel;
        platform_message.text = message.text;
        platform_message.ephemeralUserId = message.ephemeral ? message.user : null;
        next();
    });

    initialize();

    return controller;
}
