const {assert, expect} = require('chai')
const serverReady = require('simdummy').test
const fanout = require('../')

describe('fanout', () => {
    it('should send and recieve the same number of requests and responses when there is more than one endpoint', async () => {
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
