"use strict";

const http = require('http')
const https = require('https')
const { URL } = require('url')

const TimeoutError = new Error('timeout')

function fanoutExecutor(fulfill, options, body=null, headers=null, lookup=null, callback=null) {
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
        const { format, buffer } = prepare(opt.body) || body
        const request = (url.protocol === 'https:' ? https : http).request

        const req = request(opts, res => {
            (callback || fulfill)(null, wrap(res, i))
        })
        req.on('error', err => {
            (callback || fulfill)(err, callback ? null : req)
        })
        req.on('timeout', () => {
            req.abort()
            if (!callback) { fulfill(TimeoutError, req) }
        })

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

function* fanoutGenerator(options, body=null, headers=null, lookup=null, callback=null) {
    const promises = []
    const resolvers = []
    const asked = options.length
    let promise = null
    let made = 0

    fanoutExecutor(fulfill, options, body, headers, lookup, callback)

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
        if (res._done) {
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
        res._done = true
    }

    function release() {
        next()
        return promises.shift()
    }
}

function prepare(body, span=10) {
    if (!body) {
        return
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
}

function wrap(res, order) {
    res._order = order
    res.buffer = cb => {
        if (res._bytes) {
            if (!cb) {
                return Promise.resolve(res._bytes)
            }
            cb(null, res._bytes)
        } else {
            const readBody = (resolve, reject) => {
                const chunks = []
                res.on('error', reject)
                res.on('data', d => chunks.push(d))
                res.on('end', () => resolve((res._bytes = Buffer.concat(chunks))))
            }
            if (!cb) {
                return new Promise(readBody)
            }
            readBody(r => cb(null, r), cb)
        }
    }
    res.text = cb => { 
        if (!cb) {
            return res.buffer().then(b => b.toString())
        }
        res.buffer((e, b) => e ? cb(e) : cb(null, b.toString()))
    }
    res.json = cb => {
        if (!cb) {
            return res.text().then(t => JSON.parse(t))
        }
        res.text((e, t) => e ? cb(e) : cb(null, JSON.parse(t)))
    }
    return res
}

module.exports = function(options, body=null, headers=null, lookup=null, callback=null) {
    if (!callback) {
        return fanoutGenerator(options, body, headers, lookup, callback)
    }
    fanoutExecutor(null, options, body, headers, lookup, callback)
}
