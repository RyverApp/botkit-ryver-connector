var request = require('request');

/**
 * Returns an interface to the Ryver API in the context of the given bot
 *
 * @param {Object} bot The botkit bot object
 * @param {Object} config A config containing auth credentials.
 * @returns {Object} A callback-based Ryver API interface.
 */
module.exports = function (bot, config) {
    if (!config.bot_token) {
        throw new Error('Cannot use web API to send messages without an api token.');
    }

    if (!config.api_root) {
        throw new Error('Cannot use web API to send messages.');
    }

    var api_token = config.bot_token;
    var api_root = config.api_root.substr(-1) === '/' ? config.api_root.slice(0, -1) : config.api_root;
    api_root += '/api/1/odata.svc/';
    var ryver_api = { api_url: api_root };

    ryver_api.getCurrentUser = function (cb) {
        get('User.GetCurrent()', cb);
    };

    ryver_api.postForumChatMessage = function (msg, teamId, ephemeral, cb) {
        post('forums(' + teamId + ')/Chat.PostMessage()', { body: msg, isEphemeral: ephemeral }, cb);
    };

    ryver_api.postWorkroomChatMessage = function (msg, teamId, ephemeral, cb) {
        post('workrooms(' + teamId + ')/Chat.PostMessage()', { body: msg, isEphemeral: ephemeral }, cb);
    };

    ryver_api.postDirectChatMessage = function (msg, userId, ephemeral, cb) {
        post('users(' + userId + ')/Chat.PostMessage()', { body: msg, isEphemeral: ephemeral }, cb);
    };

    ryver_api.postPostComment = function (msg, postId, cb) {
        post('postComments', { comment: msg, post: { id: postId } }, cb);
    };

    ryver_api.postTaskComment = function (msg, taskId, cb) {
        post('taskComments', { comment: msg, task: { id: taskId } }, cb);
    };

    /**
     * Makes a GET request
     *
     * @param {string} url The URL to GET
     * @param {function=} cb An optional NodeJS style callback when the request completes or errors out.
     */
    function get(url, cb) {
        send('GET', url, null, cb);
    }

    /**
     * Makes a POST request
     *
     * @param {string} url The URL to POST to
     * @param {Object} data The data to POST
     * @param {function=} cb An optional NodeJS style callback when the request completes or errors out.
     */
    function post(url, data, cb) {
        send('POST', url, data, cb);
    }

    /**
     * Makes a http request
     *
     * @param {string} method GET or POST
     * @param {string} url The URL to GET
     * @param {function=} cb An optional NodeJS style callback when the request completes or errors out.
     */
    function send(method, url, data, cb) {
        cb = cb || function () { }; // TODO: move to local private 'noop' function

        bot.debug('** API CALL: ' + method + ' ' + url);
        var params = {
            method: method,
            url: api_root + url,
            headers: {
                'Accept-Version': '2018.09.01',
                'User-Agent': bot.userAgent(),
            },
            auth: { 'bearer': api_token },
            json: true,
            body: data,
            gzip: true,
        };

        request(params, function (error, response, body) {
            if (error) {
                bot.log.error('Got response', response.statusCode, error, body);
                return cb(error);
            }

            if ([200, 201, 204].includes(response.statusCode)) {
                return cb(null, body);
                // } else if (response.statusCode == 429) {
                //     return cb(new Error('Rate limit exceeded'));
            } else {
                bot.log.error('Got response', response.statusCode, error, body);
                return cb(new Error('Invalid response status code: ' + response.statusCode));
            }
        });
    }

    return ryver_api;

};
