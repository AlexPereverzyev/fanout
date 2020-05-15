const { expect } = require('chai').use(require('chai-as-promised'))
const { PassThrough } = require('stream')
const serverReady = require('simdummy').test
const fanout = require('../')

describe('fanout', () => {
    it('should override common headers when endpoint-specific headers are specified', async () => {
        await serverReady(async (port) => {
            const name = 'user-agent'
            const common = {
                [name]: 'general',
            }
            const options = {
                url: `http://localhost:${port}/?l=10&eh=1`,
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
        await serverReady(async (port) => {
            const body = 'general'
            const options = {
                url: `http://localhost:${port}/?l=10&eb=1`,
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
        await serverReady(async (port) => {
            const payload = 'payload'
            const options = {
                method: 'POST',
                url: `http://localhost:${port}/?l=10&eb=1`,
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
        await serverReady(async (port) => {
            const payload = 'payload'
            const options = {
                url: `http://localhost:${port}/?l=10&eh=1`,
            }

            for (let response of fanout([options], payload)) {
                const res = await response

                expect(res.statusCode).to.equal(200)

                const sentHeaders = await res.json()

                expect(sentHeaders).is.not.null.and.not.empty
                expect(sentHeaders['content-length']).equal(payload.length.toString())
            }
        })
    })

    it('should reject when body format is unsupported', async () => {
        const options = {
            url: `http://localhost/?l=10`,
        }

        let p = null
        try {
            p = fanout([options], 1).next()
        } catch (e) {
            expect(e).is.not.null
        }
        expect(p).is.null
    })

    it('should set content type and length header when body is JSON', async () => {
        await serverReady(async (port) => {
            const options = {
                url: `http://localhost:${port}/?l=10&eh=1`,
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

    it('should use custom DNS lookup when provided', async () => {
        await serverReady(async (port) => {
            const options = {
                url: `http://localhost:${port}/?l=10`,
            }

            const lookup = (hostname, opts, callback) => {
                expect(options.url).contains(hostname)

                require('dns').lookup(hostname, callback)
            }

            for (let response of fanout([options], null, null, lookup)) {
                const res = await response

                expect(res.statusCode).to.equal(200)
            }
        })
    })

    it('should not reject when response status is not in 200s', async () => {
        await serverReady(async (port) => {
            const options = {
                url: `http://localhost:${port}/?l=10&s=400`,
            }

            for (let response of fanout([options])) {
                const res = await response

                expect(res.statusCode).to.equal(400)
            }
        })
    })

    it('should reject when timeout is exceeded', async () => {
        await serverReady(async (port) => {
            const options = {
                url: `http://localhost:${port}/?l=100`,
                timeout: 10,
            }

            for (let response of fanout([options])) {
                return expect(response).to.eventually.be.rejectedWith('timeout')
            }
        })
    })

    it('should reject when connection is dropped', async () => {
        await serverReady(async (port) => {
            const options = {
                url: `http://localhost:${port}/?l=100&d=1`,
            }

            for (let response of fanout([options])) {
                return expect(response).to.eventually.be.rejected
            }
        })
    })

    it('should reject when Unix socket not exists', async () => {
        const options = {
            url: `http://localhost?l=10`,
            socketPath: '/tmp/missing_unix.socket'
        }

        for (let response of fanout([options])) {
            return expect(response).to.eventually.be.rejected
        }
    })

    it('should reject when endpoint is not reachable', async () => {
        const options = {
            url: `https://missing?l=10`,
        }

        for (let response of fanout([options])) {
            return expect(response).to.eventually.be.rejected
        }
    })

    it('should reject responses only when timeout expired', async () => {
        await serverReady(async (port, stats) => {
            const timeout = 250
            const latencies = [100, 200, 260, 300, 350].reverse()
            const options = latencies.map(l => {
                return {
                    url: `http://localhost:${port}/?l=${l}`,
                    timeout: timeout,
                }
            })

            const responses = []

            for (let response of fanout(options)) {
                try {
                    const res = await response
                    responses.push(res)

                    expect(res.statusCode).to.equal(200)
                } catch {
                    expect(response).is.rejectedWith('timeout')
                }
            }

            expect(stats.calls).to.equal(options.length)
            expect(responses).lengthOf(latencies.filter(l => l < timeout).length)
        })
    })

    it('should recieve the same number of responses when there is more than one endpoint', async () => {
        await serverReady(async (port, stats) => {
            const options = [
                `http://localhost:${port}/?l=100`,
                `http://localhost:${port}/?l=100`,
                `http://localhost:${port}/?l=100`,
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

            expect(stats.calls).to.equal(options.length)
            expect(responses.length).to.equal(options.length)
        })
    })

    it('should resolve faster response first when there are slower ones', async () => {
        await serverReady(async (port) => {
            const options = [
                `http://localhost:${port}/?l=150`,
                `http://localhost:${port}/?l=100`,
                `http://localhost:${port}/?l=200`,
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

                const body = await res.text()

                expect(body).is.null
            }

            expect(responses.map(r => r.req.path)).to.be.eql(
                options.map(o => o.url).sort().map(u => new URL(u)).map(u => u.pathname + u.search))
        })
    })

    it('should return the same formatted response body when its read more than once', async () => {
        await serverReady(async (port) => {
            for (let response of fanout([{ url: `http://localhost:${port}/?l=100&eh=1` }])) {
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

    it('should resolve fastest response first when responses are raced', async () => {
        await serverReady(async (port) => {
            const options = [
                `http://localhost:${port}/?l=300`,
                `http://localhost:${port}/?l=100`,
                `http://localhost:${port}/?l=200`,
            ]
                .map(endpoint => {
                    return {
                        url: endpoint,
                    }
                })

            const winner = await Promise.race(fanout(options))

            expect(winner.statusCode).to.equal(200)
            expect(options[winner.req._order].url).contains(winner.req.path)
        })
    })

    it('should resolve responses in order when they are raced', async () => {
        await serverReady(async (port) => {
            const options = [
                `http://localhost:${port}/?l=200`,
                `http://localhost:${port}/?l=100`,
                `http://localhost:${port}/?l=150`,
            ]
                .map(endpoint => {
                    return {
                        url: endpoint,
                    }
                })

            const all = []
            for (let p of fanout(options)) {
                all.push(p)
            }

            const winner = await Promise.race(all)

            expect(winner.statusCode).to.equal(200)

            const winnerToo = await all[winner.req._order]

            expect(winnerToo.statusCode).to.equal(200)
            expect(winnerToo.req.path).to.equal(winner.req.path)
        })
    })

    it('should call back with each response when call back is provided', (done) => {
        serverReady(async (port, _, __, done) => {
            const options = [
                `http://localhost:${port}/?l=10`,
                `http://localhost:${port}/?l=10`,
            ]
                .map(endpoint => {
                    return {
                        url: endpoint,
                    }
                })

            let count = 0

            fanout(options, null, null, null, (err, res) => {
                expect(err).is.null
                expect(res.statusCode).to.equal(200)

                if (options.length === ++count) done()
            })
        }, done)
    })

    it('should read response body when call back is provided', (done) => {
        serverReady(async (port, _, __, done) => {
            const options = [
                `http://localhost:${port}/?l=10&eh=1`,
                `http://localhost:${port}/?l=10&eh=1`,
            ]
                .map(endpoint => {
                    return {
                        url: endpoint,
                    }
                })

            let count = 0

            fanout(options, null, null, null, (err, res) => {
                expect(res.statusCode).to.equal(200)

                res.buffer((e, b) => {
                    expect(e).is.null
                    expect(b).is.not.null.and.not.empty

                    res.text((e, t) => {
                        expect(e).is.null
                        expect(t).is.not.null.and.not.empty

                        res.json((e, j) => {
                            expect(e).is.null
                            expect(j).is.not.null.and.not.empty

                            if (options.length === ++count) done()
                        })
                    })
                })
            })
        }, done)
    })

    it('should call back with error when response timeout exceeded', (done) => {
        serverReady(async (port, _, __, done) => {
            const options = [
                `http://localhost:${port}/?l=200`,
            ]
                .map(endpoint => {
                    return {
                        url: endpoint,
                        timeout: 100
                    }
                })

            let count = 0

            fanout(options, null, null, null, (err, res) => {
                expect(err).is.not.null
                expect(res).is.null

                if (options.length === ++count) done()
            })
        }, done)
    })

    it('should return generator when callback is not specified', (done) => {
        serverReady(async (port, _, __, done) => {
            const options = {
                url: `http://localhost:${port}/`,
            }

            const resultPromise = fanout([options])

            expect(resultPromise).is.not.null

            const resultCallback = fanout([options], null, null, null, () => done())

            expect(resultCallback).is.undefined
        }, done)
    })
})
