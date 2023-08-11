import puppeteer from 'puppeteer';

class BabyConnect {
    #user
    #pass
    #browser
    #page
    DEFAULT_TIMEOUT_MS = 10000

    constructor(user, pass) {
        this.#user = user
        this.#pass = pass
    }

    async #getNumLoggedEntries() {
        return (await this.#page.$$('#status_list .st')).length
    }

    async #waitUntilPageHasNumLoggedEntries(targetCount) {
        const endTime = new Date().valueOf() + this.DEFAULT_TIMEOUT_MS
        const wait = (time) => new Promise((resolve) => setTimeout(resolve, time || 0))
        while(new Date().valueOf() < endTime) {
            const numLoggedEntries = await this.#getNumLoggedEntries()
            if(numLoggedEntries == targetCount) return true
            await wait(500)
        }
        return false
    }

    async login() {
        // open browser to login page
        this.#browser = await puppeteer.launch({headless: 'new'})
        this.#page = await this.#browser.newPage()
        this.#page.setDefaultTimeout(this.DEFAULT_TIMEOUT_MS) // set default timeout
        await this.#page.goto('https://app.babyconnect.com/login')

        // input creds
        await this.#page.type('#email', this.#user)
        await this.#page.type('#pass', this.#pass)

        // click login
        await this.#page.click('#save')

        // wait for page to load, to verify login succeeded
        await this.#page.waitForSelector('#adminphoto_v2')
    }

    async selectChild(name) {
        // wait for kid photo icons to appear
        await this.#page.waitForSelector('.kidphoto_div')

        // click kid's icon
        const kidIcon = (await this.#page.$x(`//a/span[text()="${name}"]/..`))[0]
        await kidIcon.click()

        // wait for kid to load
        await this.#page.waitForXPath(`//span[@id='kid_wrap_header']//a[text()='${name}']`, {visible: true})
    }

    async clickIcon(iconName) {
        // click icon
        const link = (await this.#page.$x(`//a/div[text()="${iconName}"]/..`))[0]
        await link.click()

        // wait for dialog to appear
        await this.#page.waitForXPath(`//*[contains(@class, 'ui-dialog-title') and text()='${iconName}']`, {visible: true})
    }

    async getKidNames() {
        const names = []
        await this.#page.waitForSelector('.kidphoto_div')
        const kidPhotoElements = await this.#page.$$('.kidphoto_div')
        for(const element of kidPhotoElements) {
            const name = await element.evaluate(el => el.textContent)
            if('All Children' == name) continue
            names.push(name)
        }
        return names
    }

    async logDiaper(isWet, isBm, time, quantity) {
        // keep track of how many initial items are logged
        const initialNumLoggedItems = await this.#getNumLoggedEntries()

        await this.clickIcon('Diaper')

        // set time
        await this.#page.$eval('#timeinput', (el, value) => el.value = value, time)

        // set quantity
        const QUANTITY_TO_VALUE_MAP = { 'small': '0', 'medium': '1', 'large': '2' }
        await this.#page.select('#qtycombo', QUANTITY_TO_VALUE_MAP[quantity.toLowerCase()])

        // select bm / wet radio button
        const radioTextToClick = isBm ? (isWet ? 'BM + Wet' : 'BM') : 'Wet'
        const radioButton = await this.#page.waitForXPath(`//label[text()="${radioTextToClick}"]/../input`)
        await radioButton.evaluate(el => el.click())

        // click Save
        await this.#page.click('*[role=dialog] button[class~=defaultDlgButtonSave]')

        // wait until new entry appears in list
        const entryRegistered = await this.#waitUntilPageHasNumLoggedEntries(initialNumLoggedItems + 1)
        if(!entryRegistered) throw new Error('Diaper entry failed to save!')
    }

    async logBottle(time, quantityInOunces) {
        // keep track of how many initial items are logged
        const initialNumLoggedItems = await this.#getNumLoggedEntries()

        // show the bottle dialog
        await this.clickIcon('Bottle')

        // end the start and end times
        await this.#page.$eval('#timeinput', (el, value) => el.value = value, time)
        await this.#page.$eval('#endtimeinput', (el, value) => el.value = value, time)

        // select "Breastmilk"
        const breastmilkRadioButton = await this.#page.waitForSelector('input[id=bibBreastmilk][type=radio]')
        await breastmilkRadioButton.evaluate(el => el.click())

        // enter quantity
        await this.#page.$eval('*[id=bibsize] input', (el, value) => el.value = value, quantityInOunces)

        // FIX fix this hack
        // Setting the milk quantity dropdown seems to refuse to apply to the dialog (may need to wait for it to take),
        // but by running this method it forces the dialog to be updated, and thus ready to save
        await this.#page.evaluate('_dlg.setDlgText()')

        // take a screenshot
        // await this.#page.screenshot({ path: `./page.jpg` });

        // click Save
        await this.#page.click('*[role=dialog] button[class~=defaultDlgButtonSave]')

        // wait until new entry appears in list
        const entryRegistered = await this.#waitUntilPageHasNumLoggedEntries(initialNumLoggedItems + 1)
        if(!entryRegistered) throw new Error('Bottle entry failed to save!')
    }

    async logSleep(startTime, endTime) {
        // keep track of how many initial items are logged
        const initialNumLoggedItems = await this.#getNumLoggedEntries()

        // show the sleep dialog
        await this.clickIcon('Sleep')

        // end the start and end times
        await this.#page.$eval('#timeinput', (el, value) => el.value = value, startTime)
        await this.#page.$eval('#endtimeinput', (el, value) => el.value = value, endTime)

        // FIX fix this hack
        // If the child wasn't sleeping already the save button will say 'Start Sleeping' until something
        // tells the dialog that the start and end times have changed, and for some reason I can't seem to trigger
        // this change no matter what I do, so this is a hacky workaround to force the 'Start Sleeping' button to be
        // changed to 'Save'
        await this.#page.evaluate('_dlg.onDateTimeChange(true)')

        // click 'Save'
        const saveButton = await this.#page.waitForSelector('*[role=dialog] button[class~=defaultDlgButtonSave]', {visible: true})
        await saveButton.click()

        // wait until new entry appears in list
        const entryRegistered = await this.#waitUntilPageHasNumLoggedEntries(initialNumLoggedItems + 1)
        if(!entryRegistered) throw new Error('Sleep entry failed to save!')
    }

    async close() {
        await this.#browser.close()
    }
}

export default BabyConnect
