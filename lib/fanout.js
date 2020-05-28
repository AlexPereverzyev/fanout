"use strict";

const http = require('http')
const https = require('https')
const { URL } = require('url')

const TimeoutError = new Error('timeout')
const UndefinedBody = { format: null, buffer: null }

function fanoutExecutor(options, body, headers, lookup, fulfill, callback) {
    const asked = options.length

    body = prepare(body, asked)

    for (let i = 0; i < asked; i++) {
        const opt = options[i]
        const url = new URL(opt.url)
        const opts = {
            method: opt.method,
            path: url.pathname + url.search,
            headers: { ...headers, ...opt.headers },
            timeout: opt.timeout || 1000,
            agent: opt.agent,
            lookup: lookup,
        }
        if (opt.socketPath) {
            opts.socketPath = opt.socketPath
        } else {
            opts.hostname = url.hostname
            opts.port = url.port
        }
        const { format, buffer } = opt.body ? prepare(opt.body) : body
        const request = (url.protocol === 'https:' ? https : http).request
        const isCallback = (typeof callback === 'function')

        const req = request(opts, res => {
            (isCallback ? callback : fulfill)(null, wrap(res, i))
        })
        req.on('error', err => {
            (isCallback ? callback : fulfill)(err, isCallback ? null : req)
        })
        req.on('timeout', () => {
            req.abort()
            if (!isCallback) { fulfill(TimeoutError, req) }
        })
        req.setNoDelay(true)

        if (buffer) {
            if (format === 'json') {
                req.setHeader('content-type', 'application/json')
            }
            if (format === 'stream') {
                buffer.pipe(req)
            } else {
                req.setHeader('content-length', buffer.length)
                req.end(buffer)
            }
        } else {
            req.end()
        }

        req.options = opt
        req._order = i
    }
}

function* fanoutGenerator(options, body, headers, lookup) {
    const promises = []
    const resolvers = []
    const asked = options.length
    let promise = null
    let made = 0

    fanoutExecutor(options, body, headers, lookup, fulfill)

    while ((promise = release())) {
        yield promise
    }

    function next() {
        if (made < asked) {
            made++
            promises.push(
                new Promise((resolve, reject) =>
                    resolvers.push({ resolve, reject })))
        }
    }

    function fulfill(err, res) {
        if (res._completed) {
            return
        }
        let r = null
        if (resolvers.length === 0) {
            next()
        }
        if (resolvers.length === asked) {
            r = resolvers[res._order]
        } else {
            r = resolvers.shift()
        }
        if (err) {
            r.reject(err)
        } else {
            r.resolve(res)
        }
        res._completed = true
    }

    function release() {
        next()
        return promises.shift()
    }
}

function prepare(body, span = 10) {
    if (!body) {
        return UndefinedBody
    }
    if (typeof body.pipe === 'function') {
        body.setMaxListeners(span)
        return { format: 'stream', buffer: body }
    }
    if (typeof body === 'object') {
        return { format: 'json', buffer: Buffer.from(JSON.stringify(body)) }
    }
    if (typeof body === 'string') {
        return { format: 'plain', buffer: Buffer.from(body) }
    }
    throw new Error('Unsupported body format')
}

function wrap(res, order) {
    res._order = order
    res.buffer = cb => {
        if (res._consumed) {
            if (typeof cb !== 'function') {
                return Promise.resolve(res._bytes)
            }
            cb(null, res._bytes)
        } else {
            const readBody = (resolve, reject) => {
                const chunks = []
                res.on('error', reject)
                res.on('data', d => chunks.push(d))
                res.on('end', () => {
                    res._consumed = true
                    res._bytes = chunks.length ? Buffer.concat(chunks) : null
                    resolve(res._bytes)
                })
            }
            if (typeof cb !== 'function') {
                return new Promise(readBody)
            }
            readBody(r => cb(null, r), cb)
        }
    }
    res.text = cb => {
        if (typeof cb !== 'function') {
            return res.buffer().then(b => b && b.toString())
        }
        res.buffer((e, b) => cb(e, b && b.toString()))
    }
    res.json = cb => {
        if (typeof cb !== 'function') {
            return res.buffer().then(b => b && JSON.parse(b.toString()))
        }
        res.buffer((e, b) => cb(e, b && JSON.parse(b.toString())))
    }
    return res
}

module.exports = function (options, body = null, headers = null, lookup = null, callback = null) {
    if (typeof callback !== 'function') {
        return fanoutGenerator(options, body, headers, lookup)
    }
    fanoutExecutor(options, body, headers, lookup, null, callback)
}
