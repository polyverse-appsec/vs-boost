import {
    parseGoFunctions,
    languageParserSettings
} from '../../utilities/languageParsers';

import { parseFunctions } from '../../utilities/sourceLoader';
import { expect } from 'chai';
import path from 'path';
import fs from 'fs';
import { Context } from 'mocha';

describe('Go Parse Unit', () => {

    const dataFolder = __dirname + "/data/";

    it('should work in normal case', () => {
        const code = fs.readFileSync(path.join(dataFolder, 'normalFunctions.go'), 'utf8');
        const firstFunction = fs.readFileSync(path.join(dataFolder, 'normalFunctions.first.go'), 'utf8');
        const secondFunction = fs.readFileSync(path.join(dataFolder, 'normalFunctions.second.go'), 'utf8');

        const expectedOutput: [string[], number[]] = [
            [
                firstFunction,
                secondFunction
            ],
            [1, 5]
        ];

        const result = parseGoFunctions(code);
        result[0].forEach((str, i) => {
            const expected = expectedOutput[0][i];
            const actual = str;
            expect(actual).to.equal(expected);
        });
        result[1].forEach((num, i) => {
            expect(num).to.equal(expectedOutput[1][i]);
        });
        
        expect(result).to.deep.equal(expectedOutput);
    });

    it('aggregator work in normal case', function(this: Context) { 
        const code = fs.readFileSync(path.join(dataFolder, 'normalFunctions.go'), 'utf8');
    
        const expectedOutput: [string[], number[]] = [
            [
                code,
            ],
            [1]
        ];
    
        try {
            languageParserSettings.useNewParser = true;          

            const result = parseFunctions('normalFunctions.go', code, true);

            if (!languageParserSettings.useNewParser) {
                // Assuming some condition here. If it returns true, then the test will be skipped.
                this.skip();
            }

            expect(result[0]).to.equal('go');

            result[1].forEach((str, i) => {
                expect(str.trimEnd()).to.equal(expectedOutput[0][i].trimEnd());
            });
            result[2].forEach((num, i) => {
                expect(num).to.equal(expectedOutput[1][i]);
            });
        
            expect(result).to.deep.equal(expectedOutput);
        } finally {
            languageParserSettings.useNewParser = false;
        }
    });

});
