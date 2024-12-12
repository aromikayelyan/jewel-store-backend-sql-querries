import { Router } from "express"
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import {v4 as uuidv4} from 'uuid'
import { getSignedUrl} from "@aws-sdk/s3-request-presigner"
import connection from "../utils/connect.js"
import sharp from 'sharp'
import dotenv from 'dotenv'
import multer from 'multer'
import authcheck from "../middleware/authcheck.js"


dotenv.config()

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })


const BUCKET_REGION = process.env.BUCKET_REGION
const BUCKET_NAME = process.env.BUCKET_NAME
const BUCKET_KEY = process.env.ACCESS_KEY
const BUCKET_SECRET_KEY = process.env.SECRET_ACCESS_KEY


const s3 = new S3Client({
    region: BUCKET_REGION,
    credentials: {
        accessKeyId: BUCKET_KEY,
        secretAccessKey: BUCKET_SECRET_KEY,
    }
})


const router = Router()


router.post('/create', authcheck, upload.array('images', 4), async (req, res) => {
    try {
        const thedata = req.body.body
        const body = JSON.parse(thedata)

        const uploadpromises = req.files.map(async (file) => {
            const imageName = uuidv4()
            const imageBuffer = await sharp(file.buffer).rotate().resize({ height: 5000, width: 3338, fit: 'contain' }).toBuffer()
            const params = {
                Bucket: BUCKET_NAME,
                Key: imageName,
                Body: imageBuffer,
                ContentType: file.mimetype,
            }
            const command = new PutObjectCommand(params)
            await s3.send(command)

            return imageName

        })
        const imagenames = await Promise.all(uploadpromises)
        const ids = {
            imagenames
        }
        const images = JSON.stringify(ids)
        const query = 'INSERT INTO Blogs (uid, title, description, images) VALUES (?, ?, ?, ?)'
        const uid = uuidv4()

        connection.query(query, [uid, body.title, body.description, images], (err, results) => {
            if (err) {
                console.error('Ошибка при вставке данных: ', err);
                return res.status(500).send('Ошибка сервера');
            }
            res.status(200).send(`Блог добавлен с ID: ${results.insertId}`);
        })
    } catch (err) {
        console.log(err)
    }
})

router.get('/getblogs', async (req, res) => {
    try {
        const query = 'SELECT * FROM Blogs'

        const results = await new Promise((resolve, reject) => {
            connection.query(query, (err, results) => {
                if (err) {
                    console.error('Ошибка при получении данных: ', err);
                    return reject('Ошибка сервера');
                }
                resolve(results);
            });
        })

        for (const element of results) {
            const image = JSON.parse(element.images);
            element.images = await generateSignedUrls(image);
        }

        res.status(200).json(results)

    } catch (err) {
        console.log(err)
    }
})

router.get('/:id', async (req, res) => {
    try {
        const query = 'SELECT * FROM Blogs WHERE uid = ?';

        const results = await new Promise((resolve, reject) => {
            connection.query(query, [req.params.id], (err, results) => {
                if (err) {
                    console.error('Ошибка при получении данных: ', err);
                    return reject('Ошибка сервера');
                }
                resolve(results);
            });
        })

        for (const element of results) {
            const image = JSON.parse(element.images);
            element.images = await generateSignedUrls(image);
        }

        res.status(200).json(results)
    } catch (err) {
        console.log(err)
    }
})

router.delete('/:id', authcheck, async (req, res) => {
    try {
        const query = 'SELECT * FROM Blogs WHERE uid = ?'
        const delquery = 'DELETE FROM Blogs WHERE uid = ?'

        const results = await new Promise((resolve, reject) => {
            connection.query(query, [req.params.id], (err, results) => {
                if (err) {
                    console.error('Ошибка при получении данных: ', err);
                    return reject('Ошибка сервера');
                }
                resolve(results);
            });
        })

        for (const element of results) {
            const image = JSON.parse(element.images)
            for (const element of image.imagenames) {
                const getObjectParams = {
                    Bucket: BUCKET_NAME,
                    Key: element
                }
                console.log(getObjectParams.Key)
                const command = new DeleteObjectCommand(getObjectParams)
                await s3.send(command)
            }
        }

        const delresult = await new Promise((resolve, reject) => {
            connection.query(delquery, [req.params.id], (err, results) => {
                if (err) {
                    console.error('Ошибка при получении данных: ', err)
                    return reject('Ошибка сервера')
                }
                resolve(results)
            })
        })

       res.status(200).json({ message: 'Блог успешно удален' })
    
    } catch (err) {
        console.log(err)
    }
})

router.put('/put/:id', authcheck, upload.array('images', 4), async (req, res) => {
    try {
        const thedata = req.body.body
        const body = JSON.parse(thedata)
        const queryimages = 'SELECT * FROM Blogs WHERE uid = ?'
        const oldimage = []

        connection.query(queryimages, [req.params.id], async (err, results) => {
            if (err) {
                console.log(err)
            }

            for (const element of results) {
                const image = JSON.parse(element.images)
                for (const element of image.imagenames) {
                    oldimage.push(element)
                }
            }
            console.log(oldimage)

            const deletepromises = oldimage.map(async (key) => {
                console.log(key)
                const params = {
                    Bucket: BUCKET_NAME,
                    Key: key,
                }
                const command = new DeleteObjectCommand(params)
                await s3.send(command)
                return 'deleted'
            })
            const deleted = await Promise.all(deletepromises)
            console.log(deleted)

            const uploadpromises = req.files.map(async (file) => {
                const imageName = uuidv4()
                const imageBuffer = await sharp(file.buffer).resize({ height: 5000, width: 3338, fit: 'contain' }).toBuffer()
                const params = {
                    Bucket: BUCKET_NAME,
                    Key: imageName,
                    Body: imageBuffer,
                    ContentType: file.mimetype,
                }
                const command = new PutObjectCommand(params)
                await s3.send(command)

                return imageName
            })

            const imagenames = await Promise.all(uploadpromises)

            const ids = {
                imagenames
            }

            const images = JSON.stringify(ids)


            const query = `UPDATE Blogs SET title=?, description=?, images=? WHERE uid = ?`


            connection.query(query,  [body.title, body.description, images, req.params.id], (err) => {
                if (err) {
                    console.log('Ошибка при вставке данных: ', err);
                    return res.status(500).send(err);
                }
                res.status(200).send(`Блог успешно обновлен`);
            })
        })
    } catch (error) {
        console.log(error)
    }
})

const generateSignedUrls = async (images) => {
    const links = [];
    for (const imageName of images.imagenames) {
        const getObjectParams = { Bucket: BUCKET_NAME, Key: imageName };
        const command = new GetObjectCommand(getObjectParams);
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
        links.push(url);
    }
    return links;
}


export default router
