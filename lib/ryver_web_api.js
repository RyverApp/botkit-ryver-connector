"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RyverWebApi = void 0;
var request = require("request");
function noop() { }
var RyverWebApi = /** @class */ (function () {
    function RyverWebApi(apiRoot, apiToken, logger, userAgent) {
        if (!apiRoot || !apiToken) {
            throw new Error('Required configuration is missing for web API use');
        }
        apiRoot = apiRoot.substr(-1) === '/' ? apiRoot.slice(0, -1) : apiRoot;
        this.apiUrl = apiRoot + '/api/1/odata.svc/';
        this._apiToken = apiToken;
        this._userAgent = userAgent || 'botkit-ryver-connector';
        this._logger = logger;
    }
    RyverWebApi.prototype.getCurrentUser = function (cb) {
        this.get('User.GetCurrent()', cb);
    };
    RyverWebApi.prototype.postForumChatMessage = function (msg, teamId, ephemeralUserId, cb) {
        this.post('forums(' + teamId + ')/Chat.PostMessage()', { body: msg, ephemeralUserId: ephemeralUserId }, cb);
    };
    RyverWebApi.prototype.postWorkroomChatMessage = function (msg, teamId, ephemeralUserId, cb) {
        this.post('workrooms(' + teamId + ')/Chat.PostMessage()', { body: msg, ephemeralUserId: ephemeralUserId }, cb);
    };
    RyverWebApi.prototype.postDirectChatMessage = function (msg, userId, isEphemeral, cb) {
        this.post('users(' + userId + ')/Chat.PostMessage()', { body: msg, ephemeralUserId: isEphemeral ? userId : null }, cb);
    };
    RyverWebApi.prototype.postPostComment = function (msg, postId, cb) {
        this.post('postComments', { comment: msg, post: { id: postId } }, cb);
    };
    RyverWebApi.prototype.postTaskComment = function (msg, taskId, cb) {
        this.post('taskComments', { comment: msg, task: { id: taskId } }, cb);
    };
    RyverWebApi.prototype.get = function (path, cb) {
        this.send('GET', path, null, cb);
    };
    RyverWebApi.prototype.post = function (path, body, cb) {
        this.send('POST', path, body, cb);
    };
    RyverWebApi.prototype.send = function (method, path, body, cb) {
        var _this = this;
        cb = cb || noop;
        this._logger.debug('** API CALL: ' + method + ' ' + path);
        var params = {
            method: method,
            url: this.apiUrl + path,
            headers: {
                'Accept-Version': '2018.09.01',
                'User-Agent': this._userAgent,
            },
            auth: { 'bearer': this._apiToken },
            json: true,
            body: body,
            gzip: true,
        };
        request(params, function (error, response, body) {
            if (error) {
                _this._logger.error('Got response', response.statusCode, error, body);
                return cb(error);
            }
            if ([200, 201, 204].includes(response.statusCode)) {
                return cb(null, body);
                // } else if (response.statusCode == 429) {
                //     return cb(new Error('Rate limit exceeded'));
            }
            else {
                _this._logger.error('Got response', response.statusCode, error, body);
                return cb(new Error('Invalid response status code: ' + response.statusCode));
            }
        });
    };
    return RyverWebApi;
}());
exports.RyverWebApi = RyverWebApi;
