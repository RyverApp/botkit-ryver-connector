export const channelPrefix = {
    FORUM: 'F',
    WORKROOM: 'W',
    USER: 'U',
    POST: 'P',
    TASK: 'T',
};

export interface IChannel {
    id: number;
    prefix: string;
}

export function splitChannel(channel: string): IChannel | null {
    if (typeof channel !== 'string' || channel.length < 2) {
        return null;
    }

    let prefix = channel.charAt(0);
    let id = parseInt(channel.substr(1));

    if (isNaN(id)) {
        return null;
    }

    return {
        id: id,
        prefix: prefix
    };
}

export function formatChannel(prefix: string, id: number): string {
    return prefix + id;
}

export function formatChannelFromEntityType(entityType: string, id: number): string | null {
    var prefix: string;
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