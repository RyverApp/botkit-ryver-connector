"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.channelPrefix = {
    FORUM: 'F',
    WORKROOM: 'W',
    USER: 'U',
    POST: 'P',
    TASK: 'T',
};
function splitChannel(channel) {
    if (typeof channel !== 'string' || channel.length < 2) {
        return null;
    }
    var prefix = channel.charAt(0);
    var id = parseInt(channel.substr(1));
    if (isNaN(id)) {
        return null;
    }
    return {
        id: id,
        prefix: prefix
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
