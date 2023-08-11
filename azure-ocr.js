'use strict';

import { ComputerVisionClient } from '@azure/cognitiveservices-computervision'
import { ApiKeyCredentials } from '@azure/core-http';
import util from 'util'

const sleep = util.promisify(setTimeout);

class AzureOcr {
  computerVisionClient

  constructor(apiKey, endpointUrl) {
    this.computerVisionClient = new ComputerVisionClient(new ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': apiKey } }), endpointUrl);
  }

  async processStream(buffer) {
    let result = await this.computerVisionClient.readInStream(buffer)
    let operation = result.operationLocation.split('/').slice(-1)[0];
    while (result.status !== "succeeded") { await sleep(500); result = await this.computerVisionClient.getReadResult(operation); }
    return result.analyzeResult.readResults;
  }

}

export default AzureOcr