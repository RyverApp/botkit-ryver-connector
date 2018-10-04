botkit-ryver-connector
===================

Botkit connector for Ryver.

# Configure your outbound webhook

An outbound webhook must be configured in Ryver for this bot to capture and respond to events/messages. 

Choose the following events for handling specific actions

- `chat_created` - for DMs and Team/Forum chats
- `postcomment_created` - for post comments
- `taskcomment_created` - for task comments

# Botkit standard events

As outbound webhook events are sent to the bot, this botkit connector will modify some of the event types to match the botkit standard during the pipeline's categorize stage.

- Direct Messages to the bot will be categorized as the `direct_message` message type.
- Chats, post-comments or task-comments that start with the bot's `@mention` will be categorized as the `direct_mention` message type.
- Chats, post-comments or task-comments that otherwise contain the bot's `@mention` will be categorized as the `mention` message type.
- All other chats, post-comments and task-comments will be categorized as the `ambient` message type.
- All other webhook events will retain their webhook type. 

# Bot user messages

By default all webhooks that resulted from any action by the Ryver bot user will be supressed by this botkit connector.

If you wish to capture these events you will need to add the config option `allowBotOriginatedMessages: true`.
Doing so will result in bot messages being processed like any other message (such as categorization) so you may also need to include logic in your `controller.hears()` and `controller.on()` functions to ensure you are not responding to your own bot's message. This can be determined using the `bot.identity` object.

# Bot features

As well as the standard `bot.say()` and `bot.reply()` functions, we've included some addition functions for ease of development.

```
bot.sendPostComment(text, postId, cb);
bot.sendTaskComment(text, taskId, cb);
bot.sendForumChatMessage(text, forumId, isEphemeral, cb);
bot.sendWorkroomChatMessage(text, workroomId, isEphemeral, cb);
bot.sendDirectChatMessage(text, userId, isEphemeral, cb);
```

Additionally, during the start-up phase we load the bot's identity from Ryver and set it on the bot:

```
var botUserId = bot.identity.id;
var username = bot.identity.username;
```

# Notes

Ryver does not support `buttons` or `quick_replies` yet.
