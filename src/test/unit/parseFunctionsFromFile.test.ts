import { parseFunctions } from '../../split';
import { expect } from 'chai';
import path from 'path';
import fs from 'fs';
import * as assert from 'assert';

describe('parseFunctions Unit', () => {

    const dataFolder = __dirname + "/data/";

    it('should work in normal case', () => {
        const code = fs.readFileSync(path.join(dataFolder, 'dancer2_file.pm'), 'utf8');

        const expectedOutput: [string[], number[]] = [
            [
                "placeholder",
                "placeholder"
            ],
            [
                1,
                30,
                42,
                62,
                76,
                90,
                98,
                113,
                139,
                150,
                159,
              ]
        ];

        const result = parseFunctions("dancer2_file.pm", code);
        assert.equal(result[0], 'perl');
        result[1].forEach((str, i) => {
            assert.ok(str.length > 0, "non-empty string");
        });
        result[2].forEach((num, i) => {
            expect(num).to.equal(expectedOutput[1][i]);
        });        
    });

});
