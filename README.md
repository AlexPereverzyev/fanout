
# fanout

Send HTTP request to multiple endpoints at once with minimal overhead using the thin wrapper around Node.js HTTP API.

## Installation

```
npm install fast-fanout
```

## Usage

Fanout provides flexible API to send request batches efficiently.

For example, to post JSON payload to multiple endpoints and process responses as soon as they arrive:


```
const fanout = require('fanout')

const options = [
    'http://1st.endpoint.com',
    'http://2nd.endpoint.com',
    'http://3rd.endpoint.com',
]
.map(endpoint => {
    return {
        url: endpoint,
        method: 'POST',
        timeout: 1000,
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

### Options

TBD


### Callbacks

TBD
