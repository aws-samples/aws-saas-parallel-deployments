/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { Deployment, DeploymentRecord } from '../lib/types';
import * as path from 'path';

// Read deployment configuration data from disk
export function readConfig(jsonFile: string): Array<Deployment> {
  let config = [];

  const file = 'build_output/' + jsonFile;

  try {
    config = JSON.parse(readFileSync(file, { encoding: 'utf-8', flag: 'r' }));
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (err.code === 'ENOENT') {
      console.log('No ' + file + ' file present; proceeding with empty configuration.');
    } else {
      throw err;
    }
  }
  return config;
}

// Save deployment configuration data to disk
export function saveConfig(data: Array<Deployment>, jsonFile: string): void {

  // Saving to build_output directory so that we can get that separately as build artifact
  const output_dir = path.join(process.cwd(), '/build_output');
  if (!existsSync(output_dir)) {
    mkdirSync(output_dir);
  }

  writeFileSync(output_dir + '/' + jsonFile, JSON.stringify(data));
}

// Validate deployment records read from DynamoDB database.
export function isValidDeploymentRecord(record: DeploymentRecord|Deployment, regions: Array<string>): boolean {
  // Check that attribute id exists and doesn't contain whitespaces
  if (!record.id) {
    throw new Error('Missing required attribute ID');
  } else if (RegExp('\\s').test(record.id)) {
    throw new Error('Attribute ID contains whitespace characters');
  }

  // Check that attribute type exists and is either of silo or pool
  if (!record.type) {
    throw new Error('Missing required attribute type');
  } else if (record.type !== 'pool' && record.type !== 'silo') {
    throw new Error('Attribute type is not either of pool or silo');
  }

  // Check that attribute account exists and has correct format
  if (!record.account) {
    throw new Error('Missing required attribute account');
  } else if (!RegExp('^[0-9]{12}$').test(record.account)) {
    throw new Error('Attribute account has invalid AWS account ID format');
  }

  // Check that attribute region exists and is one of correct regions
  if (!record.region) {
    throw new Error('Missing required attribute region');
  } else if (!regions.includes(record.region)) {
    throw new Error('Attribute region has invalid AWS region');
  }

  return true;
}
