const { expect } = require('chai').use(require('chai-as-promised'))
const { PassThrough } = require('stream')
const serverReady = require('simdummy').test
const fanout = require('../')

describe('fanout', () => {
    it('should override common headers when endpoint-specific headers are specified', async () => {
        await serverReady(async (server, port) => {
            const name = 'user-agent'
            const common = {
                [name]: 'general',
            }
            const options = {
                url: `http://localhost:${port}?l=10&eh=1`,
                headers: {
                    [name]: 'specific',
                }
            }

            for (let response of fanout([options], null, common)) {
                const res = await response

                expect(res.statusCode).to.equal(200)

                const sentHeaders = await res.json()

                expect(sentHeaders).is.not.null.and.not.empty
                expect(sentHeaders[name]).equal(options.headers[name])
            }
        })
    })

    it('should override common body when endpoint-specific body is specified', async () => {
        await serverReady(async (server, port) => {
            server.on('request', (req, res) => req.pipe(res))

            const body = 'general'
            const options = {
                url: `http://localhost:${port}?l=10`,
                body: 'specific',
            }

            for (let response of fanout([options], body)) {
                const res = await response

                expect(res.statusCode).to.equal(200)

                const sentBody = await res.text()

                expect(sentBody).is.not.null.and.not.empty
                expect(sentBody).equal(options.body)
            }
        })
    })

    it('should pipe request body when its readable stream', async () => {
        await serverReady(async (server, port) => {
            server.on('request', (req, res) => req.pipe(res))

            const payload = 'payload'
            const options = {
                url: `http://localhost:${port}?l=10`,
                method: 'POST',
                body: new PassThrough(),
            }
            options.body.push(payload)
            options.body.push(null)

            for (let response of fanout([options])) {
                const res = await response

                expect(res.statusCode).to.equal(200)

                const sentBody = await res.text()

                expect(sentBody).is.not.null.and.not.empty
                expect(sentBody).equal(payload)
            }
        })
    })

    it('should set content length header when body is specified', async () => {
        await serverReady(async (server, port) => {
            const options = {
                url: `http://localhost:${port}?l=10&eh=1`,
                body: 'payload',
            }

            for (let response of fanout([options])) {
                const res = await response

                expect(res.statusCode).to.equal(200)

                const sentHeaders = await res.json()

                expect(sentHeaders).is.not.null.and.not.empty
                expect(sentHeaders['content-length']).equal(options.body.length.toString())
            }
        })
    })

    it('should set content type and length header when body is JSON', async () => {
        await serverReady(async (server, port) => {
            const options = {
                url: `http://localhost:${port}?l=10&eh=1`,
                body: { json: true },
            }

            for (let response of fanout([options])) {
                const res = await response

                expect(res.statusCode).to.equal(200)

                const sentHeaders = await res.json()

                expect(sentHeaders).is.not.null.and.not.empty
                expect(sentHeaders['content-length']).equal(JSON.stringify(options.body).length.toString())
                expect(sentHeaders['content-type']).equal('application/json')
            }
        })
    })

    it('should reject when timeout is exceeded', async () => {
        await serverReady(async (server, port) => {
            const options = {
                url: `http://localhost:${port}?l=100`,
                timeout: 10,
            }

            for (let response of fanout([options])) {
                return expect(response).to.eventually.be.rejectedWith('timeout')
            }
        })
    })

    it('should reject when connection is dropped', async () => {
        await serverReady(async (server, port) => {
            const options = {
                url: `http://localhost:${port}?l=100&d=1`,
            }

            for (let response of fanout([options])) {
                return expect(response).to.eventually.be.rejectedWith('socket hang up')
            }
        })
    })

    it('should recieve the same number responses when there is more than one endpoint', async () => {
        await serverReady(async (server, port) => {
            server.on('request', (req, res) => server.calls = (server.calls || 0) + 1)

            const options = [
                `http://localhost:${port}?l=100`,
                `http://localhost:${port}?l=100`,
                `http://localhost:${port}?l=100`,
            ]
                .map(endpoint => {
                    return {
                        url: endpoint,
                    }
                })

            const responses = []

            for (let response of fanout(options)) {
                const res = await response

                expect(res.statusCode).to.equal(200)

                const body = await res.json()

                expect(body).is.null

                responses.push(res)
            }

            expect(server.calls).to.equal(options.length)
            expect(responses.length).to.equal(options.length)
        })
    })

    it('should resolve faster response first when there are slower ones', async () => {
        await serverReady(async (server, port) => {
            const options = [
                `http://localhost:${port}?l=300`,
                `http://localhost:${port}?l=200`,
                `http://localhost:${port}?l=100`,
            ]
                .map(endpoint => {
                    return {
                        url: endpoint,
                    }
                })

            const responses = []

            for (let response of fanout(options)) {
                const res = await response

                expect(res.statusCode).to.equal(200)

                responses.push(res)
            }

            expect(responses.map(r => r.req.path)).to.be.eql(
                options.reverse().map(o => new URL(o.url)).map(u => u.pathname + u.search))
        })
    })

    it('should return the same formatted response body when its read more than once', async () => {
        await serverReady(async (server, port) => {
            for (let response of fanout([{ url: `http://localhost:${port}?l=100&eh=1` }])) {
                const res = await response

                expect(res.statusCode).to.equal(200)

                const buffer1 = await res.buffer()
                const buffer2 = await res.buffer()

                expect(buffer1).is.not.null.and.not.empty
                expect(buffer2).is.not.null.and.not.empty
                expect(buffer1).lengthOf(buffer2.length)

                const text1 = await res.text()
                const text2 = await res.text()

                expect(text1).is.not.null.and.not.empty
                expect(text2).is.not.null.and.not.empty
                expect(text1).equal(text2)

                const json1 = await res.json()
                const json2 = await res.json()

                expect(json1).is.not.null.and.not.empty
                expect(json2).is.not.null.and.not.empty
                expect(json1).eql(json2)
            }
        })
    })
})
