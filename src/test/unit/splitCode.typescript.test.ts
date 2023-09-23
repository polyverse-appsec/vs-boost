import { defaultCodeSplitter, languageParserSettings } from '../../utilities/languageParsers';
import { splitCodeWithAggregation } from '../../utilities/splitWithAggregation';
import { expect } from 'chai';
import path from 'path';
import fs from 'fs';
import { Context } from 'mocha';

describe('TypeScript Parse Unit', () => {

    const dataFolder = __dirname + "/data/";

    it('should work in normal case', () => {
        const code = fs.readFileSync(path.join(dataFolder, 'normalFunctions.ts'), 'utf8');
        const firstFunction = fs.readFileSync(path.join(dataFolder, 'normalFunctions.first.ts'), 'utf8');
        const secondFunction = fs.readFileSync(path.join(dataFolder, 'normalFunctions.second.ts'), 'utf8');

        const expectedOutput: [string[], number[]] = [
            [
                firstFunction,
                secondFunction
            ],
            [1, 5]
        ];

        const result = defaultCodeSplitter(code);
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
        const code = fs.readFileSync(path.join(dataFolder, 'normalFunctions.ts'), 'utf8');
    
        const expectedOutput: [string[], number[]] = [
            [
                code,
            ],
            [1]
        ];
    
        try {
            languageParserSettings.useNewParser = true;
            const result = splitCodeWithAggregation(defaultCodeSplitter, code);
        
            if (!languageParserSettings.useNewParser) {
                // Assuming some condition here. If it returns true, then the test will be skipped.
                this.skip();
            }

            result[0].forEach((str, i) => {
                expect(str.trimEnd()).to.equal(expectedOutput[0][i].trimEnd());
            });
            result[1].forEach((num, i) => {
                expect(num).to.equal(expectedOutput[1][i]);
            });
        
            expect(result).to.deep.equal(expectedOutput);
        } finally {
            languageParserSettings.useNewParser = false;
        }
        
    });
    
    it('should handle unclosed function', function(this: Context) {
        const code = fs.readFileSync(path.join(dataFolder, 'danglingBracketFunctions.ts'), 'utf8');

        const expectedOutput: [string[], number[]] = [
            [
                code,
            ],
            [1]
        ];

        const result = defaultCodeSplitter(code);

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

    it('should handle extra closing brace', function(this: Context) {
        const code = `
function testFunc() {
    console.log("Hello, World!");
}}

function testFunc2() {
    console.log("Goodbye, World!");
}
`;

        const expectedOutput: [string[], number[]] = [
            [
                `\nfunction testFunc() {\n    console.log(\"Hello, World!\");\n}}\n`,
                `\nfunction testFunc2() {\n    console.log(\"Goodbye, World!\");\n}\n`
            ],
            [1, 5]
        ];

        const result = defaultCodeSplitter(code);

        expect(result).to.deep.equal(expectedOutput);
    
    });
});
