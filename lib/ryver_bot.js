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
                        bot.sendForumChatMessage(message.text, c.id, message.ephemeral || false, cb);
                        return;
                    case utils.channelPrefix.WORKROOM:
                        bot.sendWorkroomChatMessage(message.text, c.id, message.ephemeral || false, cb);
                        return;
                    case utils.channelPrefix.USER:
                        bot.sendDirectChatMessage(message.text, c.id, message.ephemeral || false, cb);
                        return;
                }
            }

            botkit.log.info('Sending message not handled. Invalid channel format');
            cb();
        }

        // this function takes an incoming message (from a user/convo) and an outgoing message (reply from bot)
        // and ensures that the reply has the appropriate fields to appear as a reply
        bot.reply = function (src, resp, cb) {
            if (typeof (resp) === 'string') {
                resp = {
                    text: resp
                }
            }
            resp.channel = src.channel;

            bot.say(resp, cb);
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

        bot.sendDirectChatMessage = function (message, userId, ephemeral, cb) {
            botkit.api.postDirectChatMessage(message, userId, ephemeral || false, cb);
        }

        bot.sendForumChatMessage = function (message, forumId, ephemeral, cb) {
            botkit.api.postForumChatMessage(message, forumId, ephemeral || false, cb);
        }

        bot.sendWorkroomChatMessage = function (message, workroomId, ephemeral, cb) {
            botkit.api.postWorkroomChatMessage(message, workroomId, ephemeral || false, cb);
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

    // provide a way to receive messages - normally by handling an incoming webhook as below!
    controller.handleWebhookPayload = function (req, res) {
        controller.spawn({}, function (bot) {
            controller.ingest(bot, req.body, res);
        });
    };

    controller.middleware.spawn.use(function setBotIdentity(worker, next) {
        if (!controller.identity) {
            controller.log.error('Ryver bot identity not set');
            return;
        }

        worker.identity = {
            id: controller.identity.id,
            username: controller.identity.username
        };
        controller.debug('Bot identity set');

        next();
    });

    controller.middleware.ingest.use(function ingestValidateWebhookSignature(bot, message, res, next) {
        if (controller.config.webhook_secret) {
            var signature;
            var headers = res.req.headers;
            if (!headers || !(signature = headers['x-ryv-signature'])) {
                res.status(400).send('\'x-ryv-signature\' header is required');
                return;
            }

            var strBody = typeof (message.raw_message) === 'string' ? message.raw_message : JSON.stringify(message.raw_message);
            var hash = crypto.createHmac('sha256', controller.config.webhook_secret).update(strBody).digest('base64');

            if (hash !== signature) {
                res.status(400).send('\'x-ryv-signature\' header is not valid');
                return;
            }
        }
        res.status(200).send();

        next();
    });

    controller.middleware.ingest.use(function ingestIgnoreBotOriginatedMessages(bot, message, res, next) {
        if (!controller.config.allowBotOriginatedMessages && message.user.id === bot.identity.id) {
            controller.debug('Skip bot-originated message');
            return;
        }

        next();
    });

    controller.middleware.normalize.use(function normalizeMessageChannel(bot, message, next) {
        var channel = null;

        if (message.type.startsWith('chat_')) {
            if (message.data.team) {
                if (message.data.team.__metadata.type === 'Entity.Forum') {
                    channel = utils.formatChannel(utils.channelPrefix.FORUM, message.data.team.id);
                } else {
                    channel = utils.formatChannel(utils.channelPrefix.WORKROOM, message.data.team.id);
                }
            } else if (message.data.user) {
                channel = utils.formatChannel(utils.channelPrefix.USER, message.data.user.id);
            }

        } else if (message.type.startsWith('post_')) {
            channel = utils.formatChannel(utils.channelPrefix.POST, message.data.entityId || message.data.entity.id);

        } else if (message.type.startsWith('postcomment_') && message.data.entity) {
            channel = utils.formatChannel(utils.channelPrefix.POST, message.data.entity.post.id); // TODO: for a delete, I don't think we have the post ID            

        } else if (message.type.startsWith('task_')) {
            channel = utils.formatChannel(utils.channelPrefix.TASK, message.data.entityId || message.data.entity.id);

        } else if (message.type.startsWith('taskcomment_') && message.data.entity) {
            channel = utils.formatChannel(utils.channelPrefix.TASK, message.data.entity.task.id); // TODO: for a delete, I don't think we have the task ID            

        }
        message.channel = channel;

        controller.debug('normalize channel', message.channel);

        next();
    });

    controller.middleware.normalize.use(function normalizeMessageUser(bot, message, next) {
        message.user = message.user && message.user.id || null;

        controller.debug('normalize user', message.user);

        next();
    });

    controller.middleware.normalize.use(function normalizeMessageText(bot, message, next) {
        message.text = null;
        if (message.data && message.data.entity && message.data.entity.__metadata) {
            switch (message.data.entity.__metadata.type) {
                case 'Entity.ChatMessage':
                    message.text = message.data.entity.message;
                    break;
                case 'Entity.Post':
                    message.text = message.data.entity.body;
                    break;
                case 'Entity.Tasks.Task':
                    message.text = message.data.entity.body;
                    break;
                case 'Entity.Post.Comment':
                    message.text = message.data.entity.comment;
                    break;
                case 'Entity.Tasks.TaskComment':
                    message.text = message.data.entity.comment;
                    break;
            }
        }

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
        platform_message.ephemeral = message.ephemeral || false;

        next();
    });

    initialize();

    return controller;
}
