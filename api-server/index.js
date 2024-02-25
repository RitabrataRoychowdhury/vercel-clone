const express = require('express')
const {generateSlug} = require('random-word-slugs')
const  {ECSClient,RunTaskCommand} = require('@aws-sdk/client-ecs')
const {Server} = require('socket.io')
//const Redis = require('ioredis')
const cors = require('cors')
const {z} = require('zod')
const { PrismaClient } = require('@prisma/client')
const { createClient } = require('@clickhouse/client')
const { Kafka } = require('kafkajs')
const { v4: uuidv4 } = require('uuid')
const fs = require('fs')
const path = require('path')
const app = express()
const PORT = 9000

//const subscriber = new Redis('rediss://default:AVNS_g7MFAx0_Z8OMM9a4FYY@redis-20e353b1-vercel-clone101.a.aivencloud.com:17201')
const prisma = new PrismaClient({})
const io = new Server({ cors: '*'})
const kafka = new Kafka({
    clientId: `api-server`,
    brokers: ['kafka-3680143e-vercel-clone101.a.aivencloud.com:17213'],
    ssl: {
        ca: [fs.readFileSync(path.join(__dirname,'kafka.prem'), 'utf-8')]
    },
    sasl: {
        username: 'avnadmin',
        password:'AVNS_inVSPqeB5kKf-E_76tr',
        mechanism: 'plain'
    }
})
const client = createClient({
    host:'https://clickhouse-13639822-vercel-clone101.a.aivencloud.com:17201',
    database:'default',
    username:'avnadmin',
    password:'AVNS_urqeefO7kmniqKj5-Tf'
})
const consumer = kafka.consumer({ groudId: 'api-server-logs-consumer'})
io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', JSON.stringify({ log: `Subscribed to ${channel}` }))
    })
})
io.listen(9001, () => console.log('Socket Server 9001'))
const ecsClient = new ECSClient({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: 'AKIAY3KQ2QPSGJFR5IPU',
        secretAccessKey: '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'
    }
})
const config = {
    CLUSTER:'',
    TASK:''
}
app.use(express.json())
app.use(cors())

app.post('/project', async (req, res) =>{
    const schema =z.object({
        name: z.string(),
        gitURL: z.string()
    })
    const safeParseResult = schema.safeParse(req.body)
        if(safeParseResult.error) return res.status(400).json({error: safeParseResult.error})
        const {name,gitURL} = safeParseResult.data
        const project = await prisma.project.create({
        data: {
            name, 
            gitURL, 
            subDomain: generateSlug()
        }
    })
    return res.json({status: 'success', data: {project}})
    })
app.post('/deploy', async(req, res) =>{
    const { projectId } = req.body
    const project = await prisma.project.findUnique({where: {id : projectId}})
    if(!project) return res.status(404).json({error: 'Project not Found'})
    //check if there's no running deployment
    const deployment = await prisma.deployement.create({
        data: {
            project: { connect: { id: projectId } },
            status: 'QUEUED',
        }
    })
    //const projectSlug = generateSlug()
    //spin the containers
    //use aws ECS client
    const command  = new RunTaskCommand({
        cluster: config.CLUSTER,
        taskDefinition: config.TASK,
        launchtype: 'FARGATE',
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration:{
                assignPublicIp: 'ENABLED',
                subnets: ['subnet-0c364045c881f1aad', 'subnet-0b70fd02fcb7a6d19'],
                securityGroups: ['sg-0f68ac449a85ac7f6']
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: 'builder-image',
                    environment: [
                        {name: 'GIT_REPOSITORY_URL', value: project.gitURL },
                        {name: 'PROJECT_ID', value: projectId},
                        {name: 'DEPLOYMENT_ID', value: deployment.id},
                    ]
                }
            ]
        }
    })
    await ecsClient.send(command);
    return res.json({ status: 'queued', data: {projectSlug, url: `http://${projectSlug}.localhost:8000`}});
})
app.get('/logs/:id', async (req, res) => {
    const id = req.params.id;
    const logs = await client.query({
        query: `SELECT event_id, deployment_id, timestamp from log_evenets where deployment_id = {deployment_id:Stirng}`,
        query_params: {
            deployement_id : id
        },
        format: 'JSONEachRow'
    })
    const rawLogs = await logs.json()
    return res.json({logs: rawLogs})
})
//async function initRedisSubscribe(){
   // console.log('Subcribed to logs....')
        // subscriber.psubscribe('logs:*')
      //   subscriber.on('pmessage', (pattern, channel , message) => {
    //        io.to(channel).emit('message',message)
  //       })
//}
//initRedisSubscribe()
async function initkafkaConsumer() {
    await consumer.connect();
    await consumer.subscribe({ topics: ['container-logs'], fromBeginning: true })

    await consumer.run({
        autoCommit: false,
        eachBatch: async function ({ batch, heartbeat, commitOffsetsIfNecessary, resolveOffset }) {

            const messages = batch.messages;
            console.log(`Recv. ${messages.length} messages..`)
            for (const message of messages) {
                if (!message.value) continue;
                const stringMessage = message.value.toString()
                const { PROJECT_ID, DEPLOYEMENT_ID, log } = JSON.parse(stringMessage)
                console.log({ log, DEPLOYEMENT_ID })
                try {
                    const { query_id } = await client.insert({
                        table: 'log_events',
                        values: [{ event_id: uuidv4(), deployment_id: DEPLOYEMENT_ID, log }],
                        format: 'JSONEachRow'
                    })
                    console.log(query_id)
                    resolveOffset(message.offset)
                    await commitOffsetsIfNecessary(message.offset)
                    await heartbeat()
                } catch (err) {
                    console.log(err)
                }

            }
        }
    })
}
initkafkaConsumer()
app.listen(PORT, () => console.log(`API Server Running...${PORT}`))