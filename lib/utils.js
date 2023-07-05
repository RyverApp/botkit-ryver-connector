"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatChannelFromEntityType = exports.formatChannel = exports.splitChannel = exports.channelPrefix = void 0;
exports.channelPrefix = {
    FORUM: 'F',
    WORKROOM: 'W',
    USER: 'U',
    POST: 'P',
    TASK: 'T',
};
function splitChannel(channel) {
    if (channel.length < 2) {
        return null;
    }
    var id = parseInt(channel.substring(1));
    if (isNaN(id)) {
        return null;
    }
    return {
        id: id,
        prefix: channel.charAt(0)
    };
}
exports.splitChannel = splitChannel;
function formatChannel(prefix, id) {
    return prefix + id;
}
exports.formatChannel = formatChannel;
function formatChannelFromEntityType(entityType, id) {
    var prefix;
    switch (entityType) {
        case 'Entity.Forum':
            prefix = exports.channelPrefix.FORUM;
            break;
        case 'Entity.Workroom':
            prefix = exports.channelPrefix.WORKROOM;
            break;
        case 'Entity.User':
            prefix = exports.channelPrefix.USER;
            break;
        default:
            return null;
    }
    return formatChannel(prefix, id);
}
exports.formatChannelFromEntityType = formatChannelFromEntityType;
