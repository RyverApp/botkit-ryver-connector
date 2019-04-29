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

# Configure your slash commands

If you wish to use botkit to handle your slash-commands as well, you can simply configure your slash command in Ryver to use the same URL as the webhook. The botkit message type for these will be `command`.

One unique aspect to commands is that the Ryver request must be responded to within a short timeframe or Ryver will show the user an error message. Every command handler should use a special reply function to send an immediate response, and then if required can perform longer-running work and optionally send additional replies.

```
controller.hears('^/mycommand', 'command', function (bot, message) {
    bot.replyImmediate(message, 'Processing your command now...');
    // some longer running process could occur here, such as making http requests.
    bot.reply(message, 'The process is now complete');
})
```

# Bot features

As well as the standard `bot.say()` and `bot.reply()` functions, we've included some addition functions for ease of development.

```
bot.sendPostComment(text, postId, cb);
bot.sendTaskComment(text, taskId, cb);
bot.sendForumChatMessage(text, forumId, ephemeralUserId, cb);
bot.sendWorkroomChatMessage(text, workroomId, ephemeralUserId, cb);
bot.sendDirectChatMessage(text, userId, isEphemeral, cb);
```

Additionally, during the start-up phase we load the bot's identity from Ryver and set it on the bot:

```
var botUserId = bot.identity.id;
var username = bot.identity.name;
```

# Notes

Ryver does not support `buttons` or `quick_replies` yet.
