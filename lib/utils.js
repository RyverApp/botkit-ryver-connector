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

    prefix = channel.charAt(0);
    id = parseInt(channel.substr(1));

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

module.exports = {
    channelPrefix: channelPrefix,
    splitChannel: splitChannel,
    formatChannel: formatChannel,
}