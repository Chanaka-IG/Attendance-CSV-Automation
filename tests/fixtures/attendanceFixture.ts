import { test as base } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { parseCSV, buildLookup, loadConfig } from '../../src/parsers/csvParser'
import { detectConfig, saveConfig }           from '../../src/parsers/csvDetector'
import { AttendanceRecord, AttendanceLookup, ClientConfig } from '../../src/models/types'

export interface AttendanceFixtures {
  csvRecords: AttendanceRecord[]
  csvLookup: AttendanceLookup
  clientConfig: ClientConfig
}

// Resolves the client name from the CLIENT env var, or auto-detects the single CSV in data/clients/
function resolveClientName(): string {
  if (process.env.CLIENT) return process.env.CLIENT

  const clientsDir = path.resolve(__dirname, '../../data/clients')
  const files = fs.readdirSync(clientsDir).filter(f => f.endsWith('.csv'))

  if (files.length === 0) throw new Error(`No CSV files found in ${clientsDir}`)
  if (files.length > 1) throw new Error(`Multiple CSV files found in ${clientsDir} — set CLIENT env var to specify one`)

  return path.basename(files[0], '.csv')
}

const CLIENT = resolveClientName()

function resolveConfig(client: string): ClientConfig {
  const configPath = path.resolve(__dirname, `../../data/config/${client}.config.json`)
  const csvPath    = path.resolve(__dirname, `../../data/clients/${client}.csv`)

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found for client "${client}".\nExpected CSV at: ${csvPath}`)
  }

  // Always detect from the CSV so config stays in sync with whatever file is present
  const detected = detectConfig(csvPath)
  saveConfig(detected, configPath)
  console.log(`[Auto-detect] format=${detected.format}, hasHeaders=${detected.hasHeaders}, dateFormat=${detected.dateFormat}`)
  return detected
}

export const test = base.extend<AttendanceFixtures>({
  clientConfig: async ({}, use) => {
    await use(resolveConfig(CLIENT))
  },

  csvRecords: async ({ clientConfig }, use) => {
    const csvPath = path.resolve(__dirname, `../../data/clients/${CLIENT}.csv`)
    await use(parseCSV(csvPath, clientConfig))
  },

  csvLookup: async ({ csvRecords }, use) => {
    await use(buildLookup(csvRecords))
  },
})

export { expect } from '@playwright/test'
