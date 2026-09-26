import { mkdirSync, writeFileSync } from 'node:fs'
import { buildCatalogFile } from '../src/lib/holidays/build.ts'

const payload = JSON.stringify(buildCatalogFile())
mkdirSync('android-native/app/src/main/assets', { recursive: true })
writeFileSync('src/lib/holidays/catalog.json', payload)
writeFileSync('android-native/app/src/main/assets/holidays.json', payload)
console.log(`wrote ${buildCatalogFile().occurrences.length} holidays`)
