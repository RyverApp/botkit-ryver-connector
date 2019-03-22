var channelPrefix = {
    FORUM: 'F',
    WORKROOM: 'W',
    USER: 'U',
    POST: 'P',
    TASK: 'T',
};

function splitChannel(channel) {
    if (typeof (channel) !== 'string' || channel.length < 2) {
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

function formatChannel(prefix, id) {
    return prefix + id;
}

function formatChannelFromEntityType(entityType, id) {
    var prefix;
    switch (entityType) {
        case 'Entity.Forum':
            prefix = channelPrefix.FORUM;
            break;
        case 'Entity.Workroom':
            prefix = channelPrefix.WORKROOM;
            break;
        case 'Entity.User':
            prefix = channelPrefix.USER;
            break;
        default:
            return null;
    }
    return formatChannel(prefix, id);
}

module.exports = {
    channelPrefix: channelPrefix,
    splitChannel: splitChannel,
    formatChannel: formatChannel,
    formatChannelFromEntityType: formatChannelFromEntityType,
}