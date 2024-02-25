const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const mime = require('mime-types')
//const Redis = require('ioredis')
const {Kafka} = require('kafkajs')
//const publisher = new Redis('rediss://default:AVNS_g7MFAx0_Z8OMM9a4FYY@redis-20e353b1-vercel-clone101.a.aivencloud.com:17201')

const kafka = new Kafka({
    clientId: `docker-build-server-${PROJECT_ID}`,
    broker: [],
    ssl:{
        ca: [fs.readFileSync(path.join(__dirname, 'kafka.pem'), 'utf-8')]
    },
    sasl: {
        username: 'avnadmin',
        password: 'AVNS_inVSPqeB5kKf-E_76tr',
        mechanism: 'plain'
    },
})
const producer = kafka.producer()
const s3Client = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: 'AKIAY3KQ2QPSGJFR5IPU',
        secretAccessKey: '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'
    }
})

const PROJECT_ID = process.env.PROJECT_ID
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID
async function publishLog( log ){
    //publisher.publish(`log:${PROJECT_ID}`,JSON.stringify({log}))
    await producer.send({ topic: `container-logs`, messages: [{ key: 'log', value: JSON.stringify({ PROJECT_ID, DEPLOYEMENT_ID, log }) }] })
}
async function init() {
    await producer.connect()
    console.log('Executing script.js')
    await publishLog('Build Started...')
    const outDirPath = oath.join(__dirname,'output')
    const p = exec(`cd ${outDirPath} && npm install && npm run build`)

    p.stdout.on('data', function (data) {
        console.log(data.toString())
        publishing(data.toString())
    })
    p.stdout.on('error', async function (data) {
        console.log('Error',data.toString())
        await publishLog(`error: ${data.toString()}`)
    })
    p.on('close', async function(){
        console.log('Build Complete')
        await publishLog(`Build Complete`)
        const distFolderPath = path.join(__dirname, 'output', 'dist')
        const distFolderContents = fs.readdirSync(distFolderPath, {recursive : true})
        await publishLog(`Start Uploading...`)
        for (const file of distFolderContents){
            const filePath = path.join(distFolderPath, file)
            if(fs.lstatSync(filePath).isDirectory())continue;
            console.log('uploading', filePath)
           await publishLog(`uploading ${file}`)
            const command = new PutObjectCommand({
                Bucket: '',
                Key: `__outputs/${PROJECT_ID}/${filePath}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            })
            await s3Client.send(command)
            publishLog(`uploaded ${file}`)
            console.log('uploaded', filePath)
        }
        await publishLog(`Done`)
        console.log('DONE...')
        process.exit(0)
    })
}

init() 
//aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <aws_account_id>.dkr.ecr.<region>.amazonaws.com
//sudo docker build -t builder-server .
//should create a builder server image on aws ECS
//docker tag builder-server:latest 608444253156.dkr.ecr.ap-south-1.amazonaws.com/builder-server-latest
//docker push 608444253156.dkr.ecr.ap-south-1.amazonaws.com/builder-server-latest
//pushes the image in the cloud
//create a new task definition on aws launchtype= fargate and paste image uri
//finally =>sudo docker build -t builder-server
//docker tag ... 
