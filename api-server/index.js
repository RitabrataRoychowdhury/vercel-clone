const express = require('express')
const {generateSlug} = require('random-word-slugs')
const  {ECSClient,RunTaskCommand} = require('@aws-sdk/client-ecs')
const {Server} = require('socket.io')
const Redis = require('ioredis')
const app = express()
const PORT = 9000

const subscriber = new Redis('rediss://default:AVNS_g7MFAx0_Z8OMM9a4FYY@redis-20e353b1-vercel-clone101.a.aivencloud.com:17201')
const io = new Server({ cors: '*'})
io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', `Joined ${channel}`)
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
app.post('/project', async(req, res) =>{
    const {gitURL} = req.body
    const projectSlug = generateSlug()
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
                        {name: 'GIT_REPOSITORY_URL', value: gitURL},
                        {name: 'PROJECT_ID', value: projectSlug}
                    ]
                }
            ]
        }
    })
    await ecsClient.send(command);
    return res.json({ status: 'queued', data: {projectSlug, url: `http://${projectSlug}.localhost:8000`}});
})
async function initRedisSubscribe(){
    console.log('Subcribed to logs....')
         subscriber.psubscribe('logs:*')
         subscriber.on('pmessage', (pattern, channel , message) => {
            io.to(channel).emit('message',message)
         })
}
initRedisSubscribe()
app.listen(PORT, () => console.log(`API Server Running...${PORT}`))