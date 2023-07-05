import request = require('request');

function noop() {
}

export class RyverWebApi {

    private readonly _apiToken: string;

    public readonly apiUrl: string;
    public readonly _logger: ILogger;
    public readonly _userAgent: string;

    constructor(apiRoot: string, apiToken: string, logger: ILogger, userAgent?: string) {
        if (!apiRoot || !apiToken) {
            throw new Error('Required configuration is missing for web API use');
        }

        apiRoot = apiRoot.substring(-1) === '/' ? apiRoot.slice(0, -1) : apiRoot;
        this.apiUrl = apiRoot + '/api/1/odata.svc/';
        this._apiToken = apiToken;
        this._userAgent = userAgent || 'botkit-ryver-connector';
        this._logger = logger;
    }

    public getCurrentUser(cb: ApiResultCallback<ApiOperationResponse<ApiResourceUser>>) {
        this.get('User.GetCurrent()', cb);
    }

    public postForumChatMessage(msg: string, teamId: number, ephemeralUserId: number | null, cb?: ApiCallback) {
        this.post('forums(' + teamId + ')/Chat.PostMessage()', {body: msg, ephemeralUserId: ephemeralUserId}, cb);
    }

    public postWorkroomChatMessage(msg: string, teamId: number, ephemeralUserId: number | null, cb?: ApiCallback) {
        this.post('workrooms(' + teamId + ')/Chat.PostMessage()', {body: msg, ephemeralUserId: ephemeralUserId}, cb);
    }

    public postDirectChatMessage(msg: string, userId: number, isEphemeral: boolean, cb?: ApiCallback) {
        this.post('users(' + userId + ')/Chat.PostMessage()', {
            body: msg,
            ephemeralUserId: isEphemeral ? userId : null
        }, cb);
    }

    public postPostComment(msg: string, postId: number, cb?: ApiCallback) {
        this.post('postComments', {comment: msg, post: {id: postId}}, cb);
    }

    public postTaskComment(msg: string, taskId: number, cb?: ApiCallback) {
        this.post('taskComments', {comment: msg, task: {id: taskId}}, cb);
    }

    public get<T>(path: string, cb?: ApiCallback | ApiResultCallback<T>) {
        this.send('GET', path, null, cb);
    }

    public post<T>(path: string, body: object | null, cb?: ApiCallback | ApiResultCallback<T>) {
        this.send('POST', path, body, cb);
    }

    public send<T>(method: string, path: string, body: object | null, cb?: ApiCallback | ApiResultCallback<T>) {
        cb = cb || noop;

        this._logger.debug('** API CALL: ' + method + ' ' + path);
        const params = {
            method: method,
            url: this.apiUrl + path,
            headers: {
                'Accept-Version': '2018.09.01',
                'User-Agent': this._userAgent,
            },
            auth: {'bearer': this._apiToken},
            json: true,
            body: body,
            gzip: true,
        };

        request(params, (error, response, body) => {
            if (error) {
                this._logger.error('Got response', response.statusCode, error, body);
                return cb!(error);
            }

            if ([200, 201, 204].includes(response.statusCode)) {
                return cb!(null, body);
                // } else if (response.statusCode == 429) {
                //     return cb(new Error('Rate limit exceeded'));
            } else {
                this._logger.error('Got response', response.statusCode, error, body);
                return cb!(new Error('Invalid response status code: ' + response.statusCode));
            }
        });
    }
}

export type ApiCallback = (err: Error | null) => void;
export type ApiResultCallback<T> = (err: Error | null, res?: T) => void;

export interface ApiOperationResponse<T> {
    d: T;
}

export interface ApiOdataResponse<T> {
    d: {
        results: T;
    };
}

export interface ApiResourceUser {
    id: number;
    username: string,
    displayName: string,
    emailAddress: string,
    timeZone: string,
    type: string,
}

export interface ILogger {
    debug: Function;
    error: Function;
}