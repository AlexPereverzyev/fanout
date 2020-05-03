
"use strict";

const http = require('http')
const process = require('process');
const express = require('express');
const app = express();
const port = 8888;
const span = 100
const payload = { test: true }

process.on('warning', e => console.warn(e.stack));
process.on('SIGINT', () => process.exit());

const agent = http.Agent({
    keepAlive: true,
    maxSockets: 4000,
    maxFreeSockets: 2000,
})

const fanout = require('..')
const options = new Array(span)
for (let i = 0; i < span; i++) {
    const p = 9999
    options[i] = {
        agent: agent,
        method: 'POST',
        url: `http://localhost:${p}/t`,
        timeout: 3000,
    }
}
app.all('/p', async (req, res) => {
    let errors = 0

    for (let p of fanout(options, payload)) {
        try {
            const r = await p
            const j = await r.json() 
        } catch (e) {
            errors ++
        }
    }
    
    if (errors) {
        console.warn(`p-Errors: ${errors}`)
    }

    res.status(200).end('OK');
});

app.all('/c', async (req, res) => {
    let errors = 0
    let count = options.length

    function done() {
        if (--count === 0) {
            if (errors) {
                console.warn(`c-Errors: ${errors}`)
            }
            res.status(200).end('OK');
        }
    }

    fanout(options, payload, null, null, (e, r) => {
        if (e) {
            errors ++
            done()
        } else {
            r.json(done)
        }
    })
});

const rpn = require('request-promise-native')
const rpnOptions = options.map(o => {
    return {
        uri: o.url,
        body: payload,
        timeout: o.timeout,
        agent: o.agent,
        json: true,
    }
});
app.all('/r', async (req, res) => {
    let errors = 0

    const rs = await Promise.all(
        rpnOptions.map(async o => {
            try { 
                const j = await rpn.post(o)
                return j
            } catch (e) {
                errors ++
            }
        })
    )

    if (errors) {
        console.warn(`r-Errors: ${errors}`)
    }

    res.status(200).end('OK');
});

const fetch = require('node-fetch');
const fetchOptions = options.map(o => {
    return {
        url: o.url,
        method: o.method,
        body: payload,
        timeout: o.timeout,
        agent: o.agent,
        headers: {
            'accept-encoding': 'None'
        }
    }
})
app.all('/f', async (req, res) => {
    let errors = 0

    const rs = await Promise.all(
        fetchOptions.map(async o => {
            try { 
                const r = await fetch(o.url, o)
                const j = await r.json()
                return j
            } catch (e) {
                errors ++
            }
        })
    )

    if (errors) {
        console.warn(`f-Errors: ${errors}`)
    }

    res.status(200).end('OK');
});

const needle = require('needle');
const needleOptions = options.map(o => {
    return {
        url: o.url,
        method: o.method,
        body: payload,
        timeout: o.timeout,
        agent: o.agent,
        json: true,   
    }
})
app.all('/n', async (req, res) => {
    let errors = 0

    const rs = await Promise.all(
        needleOptions.map(o => 
            new Promise((resolve, reject) => {
                needle.post(o.url, payload, o, (err, res, body) => {
                    if (err) {
                        errors ++
                        resolve(null)
                    } else {
                        const t = JSON.parse(body.toString())
                        resolve(t)
                    }
                })
            })
        )
    )

    if (errors) {
        console.warn(`n-Errors: ${errors}`)
    }

    res.status(200).end('OK');
});

const got = require('got');
const gotOptions = options.map(o => {
    return {
        url: o.url,
        method: o.method,
        json: payload,
        timeout: o.timeout,
        agent: { http: o.agent },
        responseType: 'json',
        retry: 0,
        headers: {
            'accept-encoding': 'None'
        }
    }
})
app.all('/g', async (req, res) => {
    let errors = 0

    const rs = await Promise.all(
        gotOptions.map(async o => {
            try { 
                const r = await (got.post(o).on('request', rq => setTimeout(() => rq.abort(), o.timeout)))
                return r
            } catch (e) {
                errors ++
            }
        })
    )

    if (errors) {
        console.warn(`g-Errors: ${errors}`)
    }

    res.status(200).end('OK');
});

const axios = require('axios').default;
const axiosOptions = options.map(o => {
    return {
        url: o.url,
        method: o.method,
        data: payload,
        timeout: o.timeout,
        httpAgent: o.agent,
        headers: {
            'accept-encoding': 'None'
        }
    }
})
app.all('/a', async (req, res) => {
    let errors = 0

    const rs = await Promise.all(
        axiosOptions.map(async o => {
            try { 
                const r = await axios.post(o.url, payload, o)
                return r
            } catch (e) {
                errors ++
            }
        })
    )

    if (errors) {
        console.warn(`a-Errors: ${errors}`)
    }

    res.status(200).end('OK');
});

const server = app.listen(port);
console.log(`HTTP server listening at ${port}`);

module.exports = server;
