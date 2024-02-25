const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const mime = require('mime-types')
const Redis = require('ioredis')

const publisher = new Redis('rediss://default:AVNS_g7MFAx0_Z8OMM9a4FYY@redis-20e353b1-vercel-clone101.a.aivencloud.com:17201')

const s3Client = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: 'AKIAY3KQ2QPSGJFR5IPU',
        secretAccessKey: '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'
    }
})

const PROJECT_ID = process.env.PROJECT_ID
function publishLog( log ){
    publisher.publish(`log:${PROJECT_ID}`,JSON.stringify({log}))
}
async function init() {
    console.log('Executing script.js')
    publishLog('Build Started...')
    const outDirPath = oath.join(__dirname,'output')
    const p = exec(`cd ${outDirPath} && npm install && npm run build`)

    p.stdout.on('data', function (data) {
        console.log(data.toString())
        publishing(data.toString())
    })
    p.stdout.on('error', function (data) {
        console.log('Error',data.toString())
        publishLog(`error: ${data.toString()}`)
    })
    p.on('close', async function(){
        console.log('Build Complete')
        publishLog(`Build Complete`)
        const distFolderPath = path.join(__dirname, 'output', 'dist')
        const distFolderContents = fs.readdirSync(distFolderPath, {recursive : true})
        publishLog(`Start Uploading...`)
        for (const file of distFolderContents){
            const filePath = path.join(distFolderPath, file)
            if(fs.lstatSync(filePath).isDirectory())continue;
            console.log('uploading', filePath)
            publishLog(`uploading ${file}`)
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
        publishLog(`Done`)
        console.log('DONE...')
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
