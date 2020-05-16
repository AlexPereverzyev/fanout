
# fanout

[![npm](https://img.shields.io/npm/v/fast-fanout.svg?style=flat-square)](https://www.npmjs.org/package/fast-fanout)
[![Coverage Status](https://coveralls.io/repos/github/AlexPereverzyev/fanout/badge.svg?branch=master)](https://coveralls.io/github/AlexPereverzyev/fanout?branch=master)

Send HTTP request to multiple endpoints at once with minimal overhead using the thin wrapper around Node.js HTTP API.

Fanout excels at handling large amounts of outgoing HTTP traffic (think 100 outgoing per 1 incoming requests) and outperforms existing Node.js HTTP clients by 20-50%.


## Installation

```
npm install fast-fanout
```

## Usage

Fanout provides flexible API to send request batches efficiently.

For example, to post JSON payload to multiple endpoints and process responses as soon as they arrive:


```
const fanout = require('fast-fanout')

const options = [
    'http://1st.endpoint.com',
    'http://2nd.endpoint.com',
    'http://3rd.endpoint.com',
]
.map(endpoint => {
    return {
        url: endpoint,
        method: 'POST',
        timeout: 200,
    }
})

const payload = { test: true }

for (let response of fanout(options, payload)) {
    try {
        const res = await response
        const body = await res.json()
    } catch (e) {
        console.error(e)
    }
}
```

_fanout_ is a generator function, it returns promises and resolves them as soon as responses arrive. In turn, returned promise resolves to native Node.js HTTP response which can be piped further.


## Request Options

The following request options are available:

- url - endpoint URL
- method - HTTP method (GET default)
- headers - customize request headers per endpoint
- body - customize request body per endpoint
- timeout - response timeout (1000 ms default)
- agent - HTTP(S) agent for connection pooling

Besides request options, _fanout_ accepts the following optional arguments (in order):

- body - common for all endpoints request body 
- headers - common request headers
- lookup - custom DNS lookup function
- callback: _function(err, res)_ - when provided, _fanout_ executes the callback for each received response in order they arrive and no longer works as promise generator. The reason to support callback - they are a bit faster than promises

Where _body_ can be Unicode string, stream or object (stringified before request sent).
