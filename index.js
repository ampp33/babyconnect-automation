import os from 'os'
import fs from 'fs'

import express from 'express'
import cors from 'cors'
const app = express()
const port = 3000

// var corsOptions = {
//   origin: 'http://localhost:8080',
//   optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
// }
app.use(cors())
app.use(express.json())

import multer from 'multer'
const upload = multer({ dest: os.tmpdir() });

import security from "./security.json" assert { type: "json" };

import BabyConnect from './babyconnect.js';
import InfoSheetOcrProcessor from './info-sheet-ocr-processor.js';
import AzureOcr from './azure-ocr.js'

import data from "./example-form.json" assert { type: "json" };

app.post('/ocr', upload.single('file'), async (req, res) => {
  try {
    // default ocr data to canned data, and only use ocr data if not disabled
    let ocrJson = data
    const skipOcr = req.query.skipOcr || false
    console.log(`skip ocr?: ${skipOcr}`)
    if(!skipOcr) {
      console.log(req.file.path)
      const buffer = fs.readFileSync(req.file.path).buffer
      ocrJson = await new AzureOcr(security.vision_api_key, security.vision_endpoint_url).processStream(buffer)
      // console.log(JSON.stringify(ocrJson))
    }
    const words = ocrJson[0]
                    .lines
                    .map(line => line.words)
                    .reduce((acc, curr) => { acc.push(...curr); return acc; }, [])
                    .map(word => word.text)
    console.log(words)
    const cleanedData = new InfoSheetOcrProcessor(words).getProcessedData()
    res.send(cleanedData)
  } catch (err) {
    console.error(err)
    res.status(500).send('Something broke!')
  }
})

app.post('/bc', async (req, res) => {
    const data = req.body

    const runOrError = async (func, errorMsg) => {
      let isError = false
      await func().catch((err) => {
        console.error(err, errorMsg, data)
        res.status(500).send({
          errorMessage: errorMsg,
          unloggedData: data
        })
        isError = true
      })
      return !isError
    }

    const handleItems = async (list, handler, errorMsg) => {
      let item
      while((item = list.shift())) {
        console.log(`handling: ${JSON.stringify(item)}`)
        let isError = false
        await handler(item).catch((err) => {
          console.error(err, errorMsg, data)
          list.unshift(item) // add failed item back to list
          res.status(500).send({
            errorMessage: `${errorMsg} : ${JSON.stringify(item)}`,
            unloggedData: data
          })
          isError = true
        })
        if(isError) return false
      }
      return true
    }

    const bc = new BabyConnect(security.username, security.password)

    // login and select baby name in a safe fashion
    console.log('logging in...')
    if(!await runOrError(async () => await bc.login(), 'Failed to login to Babyconnect, maybe credentials have changed?')) return
    console.log(`selecting child ${data.childName}`)
    if(!await runOrError(async () => await bc.selectChild(data.childName), `Failed to select child ${data.childName}, does the name match the name in the app?`)) return

    // log everything
    console.log('logging bottles...')
    if(!await handleItems(data.bottles, async (bottle) => await bc.logBottle(bottle.time, bottle.amountInOz), `Failed to log bottle`)) { await bc.close(); return }
    console.log('logging naps...')
    if(!await handleItems(data.naps, async (nap) => await bc.logSleep(nap.startTime, nap.endTime), `Failed to log nap`)) { await bc.close(); return }
    console.log('logging diapers...')
    if(!await handleItems(data.diapers, async (diaper) => await bc.logDiaper(diaper.isWet, diaper.isBm, diaper.time, 'Medium'), `Failed to log diaper`)) { await bc.close(); return }

    // close browser session
    console.log('closing browser')
    await bc.close()
    
    console.log('done')

    res.send([])
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
