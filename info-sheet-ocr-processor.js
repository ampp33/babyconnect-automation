class InfoSheetOcrProcessor {
    words
    REQUIRED_LETTER_MATCH_ACCURACY = .8

    constructor(words) {
        this.words = words
        // console.log(this.words)
    }

    #isDailyInformationSheet() {
      return this.#findIndexOfWords('daily information sheet'.split(' ')) != -1
    }

    #findTextBetweenPatterns(startText, endText, startIndex = 0) {
        const tokenize = words => words.toLowerCase().split(' ')
        const startWords = tokenize(startText)
        const endWords = tokenize(endText)

        let startIndexExclusive = this.#findIndexOfWords(startWords, startIndex)
        // if words not found then return null to indicate that no text could be found
        if(startIndexExclusive == -1) return null
        // increment to index after the words, exclusive
        startIndexExclusive += startWords.length

        let endIndexExclusive = this.#findIndexOfWords(endWords, startIndex)
        // if words not found then return null to indicate that no text could be found
        if(endIndexExclusive == -1) return null
        // increment to index before the words, exclusive
        endIndexExclusive -= 1

        return this.words.slice(startIndexExclusive, endIndexExclusive + 1)
    }

    #findIndexOfWords(searchWords, startIndex = 0) {
      main: for(let wordIndex = startIndex; wordIndex < this.words.length; wordIndex++) {
        for(let searchWordsIndex = 0; searchWordsIndex < searchWords.length; searchWordsIndex++) {
          const searchWord = searchWords[searchWordsIndex]
          const numMatchingLetters = this.#findNumberOfMatchingLetters(searchWord, this.words[wordIndex])
          if(numMatchingLetters / searchWord.length >= this.REQUIRED_LETTER_MATCH_ACCURACY) {
            if(searchWordsIndex + 1 == searchWords.length) {
              // found all the start words in order, return index that first word was found at (inclusive)
              return wordIndex - (searchWords.length - 1)
            }
            // word matches, but haven't yet matched all start words, so keep checking them
            wordIndex++
            continue
          } else {
            // word didn't match, move to the next word is the main list to evaluate
            continue main
          }
        }
      }
      // words not found
      return -1
    }

    #findNumberOfMatchingLetters(searchWord, actualWord) {
        const results = []
        this.#findNumMatchingLettersRecursive([...searchWord.toLowerCase()], 0, [...actualWord.toLowerCase()], 0, 0, results)
        return results.reduce((acc, curr) => acc > curr ? acc : curr)
    }

    #findNumMatchingLettersRecursive(searchChars, searchIndex, targetChars, targetIndex, numMatching=0, results=[]) {
        // exit if we've reached the end of either list
        if(searchIndex == searchChars.length || targetIndex == targetChars.length) {
            results.push(numMatching)
            return
        }
        if(searchChars[searchIndex] == targetChars[targetIndex]) {
            this.#findNumMatchingLettersRecursive(searchChars, searchIndex + 1, targetChars, targetIndex + 1, numMatching + 1, results)
        } else {
            // characters don't match, check routes where we 1) increment the search string or 2) increment the target string
            this.#findNumMatchingLettersRecursive(searchChars, searchIndex + 1, targetChars, targetIndex, numMatching, results)
            this.#findNumMatchingLettersRecursive(searchChars, searchIndex, targetChars, targetIndex + 1, numMatching, results)
        }
    }

    #parseBabyName() {
      const nameValues = this.#findTextBetweenPatterns('daily information sheet name', 'bottle')
      return nameValues?.length > 0 ? nameValues[0] : ''
    }

    #parseRawActivityData() {
      const afternoonWordIndex = this.#findIndexOfWords(['afternoon'])
      const morningBottleTimes = this.#findTextBetweenPatterns('how much', 'slept')
      const afternoonBottleTimes = this.#findTextBetweenPatterns('how much', 'slept', afternoonWordIndex)
      // console.log('bottle times', morningBottleTimes, afternoonBottleTimes)

      const morningSleepTimes = this.#findTextBetweenPatterns('from', 'bowel movement')
      const afternoonSleepTimes = this.#findTextBetweenPatterns('from', 'bowel movement', afternoonWordIndex)
      // console.log('sleep times', morningSleepTimes, afternoonSleepTimes)

      const morningDiaperTypes = this.#findTextBetweenPatterns('bowel movement', 'diaper change times')
      const morningDiaperTimes = this.#findTextBetweenPatterns('diaper change times', 'overall')
      const afternoonDiaperTypes = this.#findTextBetweenPatterns('bowel movement', 'diaper change times', afternoonWordIndex)
      const afternoonDiaperTimes = this.#findTextBetweenPatterns('diaper change times', 'last diaper change', afternoonWordIndex)

      return {
        morningBottleTimes,
        afternoonBottleTimes,
        morningSleepTimes,
        afternoonSleepTimes,
        morningDiaperTypes,
        morningDiaperTimes,
        afternoonDiaperTypes,
        afternoonDiaperTimes
      }
    }

    #parseTime(text, isMorning) {
      const amPM = (isMorning ? 'AM' : 'PM')
      const chars = [...text]
      const digits = []
      for(const c of chars) if(c >= '0' && c <= '9') digits.push(c)
      if(digits.length === 3) return digits[0] + ':' + digits[1] + digits[2] + amPM
      if(digits.length === 4) {
        const hour = digits[0] + digits[1]
        if(parseInt(hour) > 12) {
          return digits[0] + ':' + digits[digits.length - 2] + digits[digits.length - 1] + amPM
        } else if (parseInt(hour) == 12) {
          // if time is 12 then assume it's afternoon, since daycare isn't open at midnight :)
          return digits[0] + digits[1] + ':' + digits[2] + digits[3] + 'PM'
        }
        return digits[0] + digits[1] + ':' + digits[2] + digits[3] + amPM
      }
      if(digits.length > 4) return digits[0] + digits[1] + ':' + digits[digits.length - 2] + digits[digits.length - 1] + amPM
      // less than 3 digits, return null to indicate that the time couldn't be parsed
      return null
    }

    #parseDiaperType(text) {
      const numBmLetters = this.#findNumberOfMatchingLetters('bm', text)
      const numWetLetters = this.#findNumberOfMatchingLetters('wet', text)
      if(numBmLetters > 1) return true
      if(numWetLetters > 1) return false
      return null
    }

    #condenseDiaperTypes(diaperTypes, desiredListLength) {
      const results = []
      let numToCondense = diaperTypes.length - desiredListLength
      for(let i = 0; i < diaperTypes.length; i++) {
        // if we don't need to combine anymore, just dump the rest of the items individually
        // into the result array
        if(numToCondense == 0) {
          results.push(...diaperTypes.slice(i).map(type => { return { isBm: type, isWet: !type }}))
          break
        }

        const diaperType = diaperTypes[i]
        const nextDiaperType = (i + 1 != diaperTypes.length) ? diaperTypes[i + 1] : null

        if(diaperType == nextDiaperType) {
          // current type and next are the same, we can't combine them,
          // so add the current diaper detail and skip to the next type
          results.push({ isBm: diaperType, isWet: !diaperType })
          continue
        } else if (diaperType == true) {
          // current type is a BM, and the following is a wet, we can combine them!
          results.push({ isBm: true, isWet: true })
          // indicate that we've condensed one type!
          numToCondense--
          // skip to the next next item to process, since we already processed the next item
          i++
          continue
        } else {
          // current item is wet and the next is BM, could combine, but BM is usually declared first on the sheet,
          // so assume that BM could be paired with another wet (or is alone)... so just add this type and skip to the next
          results.push({ isBm: false, isWet: true })
          continue
        }
      }

      return results
    }

    #processDiaperDetails(morningTypes, afternoonTypes, morningTimes, afternoonTimes) {
      const results = []

      const oneToOneMap = (types, times) => {
        const results = []
        for(let i = 0; i < times.length; i++) {
          if(i < types.length) {
            // a type value exists for this time, so combine their values
            results.push({ time: times[i], isBm: types[i].isBm, isWet: types[i].isWet })
          } else {
            // no type exists for this time, so add it anyway but don't mark any of the types
            results.push({ time: times[i], isBm: false, isWet: false })
          }
        }
        return results
      }

      // morning
      const condensedMorningTypes = this.#condenseDiaperTypes(morningTypes, morningTimes.length)
      results.push(...oneToOneMap(condensedMorningTypes, morningTimes))

      // afternoon
      const condensedAfternoonTypes = this.#condenseDiaperTypes(afternoonTypes, afternoonTimes.length)
      results.push(...oneToOneMap(condensedAfternoonTypes, afternoonTimes))

      return results
    }

    #cleanRawActivityData({morningBottleTimes, afternoonBottleTimes, morningSleepTimes, afternoonSleepTimes, morningDiaperTypes, morningDiaperTimes, afternoonDiaperTypes, afternoonDiaperTimes}) {
      const bottles = [], naps = [], diapers = []

      const processTimes = (rawBottleTimes, isMorning) => rawBottleTimes.map(rawTime => this.#parseTime(rawTime, isMorning)).filter(time => time != null)

      // process bottles
      bottles.push(...processTimes(morningBottleTimes, true))
      bottles.push(...processTimes(afternoonBottleTimes, false))
      
      // process naps
      const startAndEndTimeReducer = (acc, curr, index) => {
        index % 2 == 0 ? acc.push({ startTime: curr }) : acc[acc.length - 1].endTime = curr
        return acc
      }
      const morningNaps = processTimes(morningSleepTimes, true).reduce(startAndEndTimeReducer, [])
      const afternoonNaps = processTimes(afternoonSleepTimes, false).reduce(startAndEndTimeReducer, [])
      naps.push(...morningNaps)
      naps.push(...afternoonNaps)

      // process diapers
      const morningDiaperTypesParsed = morningDiaperTypes.map(text => this.#parseDiaperType(text)).filter(type => type != null)
      const afternoonDiaperTypesParsed = afternoonDiaperTypes.map(text => this.#parseDiaperType(text)).filter(type => type != null)
      // NOTE sometimes diaper types get picked up in the 'times' values, so attempt to process types from the times as well
      const misplacedMorningDiaperTypesParsed = morningDiaperTimes.map(text => this.#parseDiaperType(text)).filter(type => type != null)
      const misplacedAfternoonDiaperTypesParsed = afternoonDiaperTimes.map(text => this.#parseDiaperType(text)).filter(type => type != null)
      morningDiaperTypesParsed.push(...misplacedMorningDiaperTypesParsed)
      afternoonDiaperTypesParsed.push(...misplacedAfternoonDiaperTypesParsed)

      // console.log(morningDiaperTypesParsed, afternoonDiaperTypesParsed)
      const morningDiaperTimesParsed = processTimes(morningDiaperTimes, true)
      const afternoonDiaperTimesParsed = processTimes(afternoonDiaperTimes, false)
      diapers.push(...this.#processDiaperDetails(morningDiaperTypesParsed, afternoonDiaperTypesParsed, morningDiaperTimesParsed, afternoonDiaperTimesParsed))

      return {
        bottles,
        naps,
        diapers
      }
    }

    getProcessedData() {
      // short circuit early if the form data supplied suggests that it's not a baby info sheet
      if(!this.#isDailyInformationSheet()) return []

      const rawActivityData = this.#parseRawActivityData()
      // console.log(rawActivityData)
      const cleanedData = this.#cleanRawActivityData(rawActivityData)
      // console.log(cleanedData)
      return {
        childName: this.#parseBabyName(),
        ...cleanedData
      }
    }

}

export default InfoSheetOcrProcessor

// const words = data[0]
//               .lines
//               .map(line => line.words)
//               .reduce((acc, curr) => { acc.push(...curr); return acc; }, [])
//               .map(word => word.text)

// const words = ['bob', 'and', 'steve']

// const cleanedData = new InfoSheetOcrProcessor(words).getProcessedData()
// console.log(cleanedData)
