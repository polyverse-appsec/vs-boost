import { expect } from "chai";
import { WorkflowEngine, WorkflowError } from "../../workflow_engine";

describe("WorkflowEngine", () => {
    it("should run promises in the correct order", async () => {
        let log: string[] = [];

        const beforeGen = [
            () => async () => {
                log.push("before");
                return;
            },
        ];
        const main = [
            () => async () => {
                log.push("main1");
                return;
            },
            () => async () => {
                log.push("main2");
                return;
            },
            () => async () => {
                log.push("main3");
                return;
            },
            () => async () => {
                log.push("main4");
                return;
            },
        ];
        const afterEach = [
            () => async () => {
                console.log(log);
                return;
            },
        ];
        const afterEachGroup = [
            () => async () => {
                log.push("afterEachGroup");
                return;
            },
        ];
        const afterGen = [
            () => async () => {
                log.push("after");
                return;
            },
        ];

        const pattern = [1, 2];

        const engine = new WorkflowEngine(main, {
            before: beforeGen,
            afterEach: afterEach,
            afterEachGroup: afterEachGroup,
            after: afterGen,
            pattern: pattern,
        });
        await engine.run();

        expect(log).to.deep.equal([
            "before",
            "main1",
            "afterEachGroup",
            "main2",
            "main3",
            "afterEachGroup",
            "main4",
            "afterEachGroup",
            "after",
        ]);
    });

    // More tests can be written to verify other functionalities...
    it("should handle closure state properly", async () => {
        //create an array of 5 random numbers
        let randomNumbers: number[] = [];
        for (let i = 0; i < 5; i++) {
            //create a random number that is an integer between 0 and 100
            randomNumbers.push(Math.floor(Math.random() * 100));
        }
        //get the sum for double checking
        let sum = randomNumbers.reduce((a, b) => a + b, 0);
        //now put each number into a promise generator
        let promiseGenerators: (() => () => Promise<number>)[] = [];
        for (let i = 0; i < 5; i++) {
            promiseGenerators.push(() => {
                return async () => {
                    return randomNumbers[i];
                };
            });
        }
        //now create a summary promise generator. use a closure to keep track of the sum, with a variable here on
        //the outside of the closure to check the sum later
        let sumCheck = 0;
        let summaryPromiseGenerator = () => {
            return async (inputs: any[]) => {
                //the inputs are the results of the previous promises
                sumCheck += inputs.reduce((a: number, b: number) => a + b, 0);
                return sumCheck as any;
            };
        };
        //now create the engine
        const engine = new WorkflowEngine(promiseGenerators, {
            afterEachGroup: [summaryPromiseGenerator],
        });
        //run the engine
        await engine.run();
        //check the sum
        expect(sumCheck).to.equal(sum);
    });

    it('should retry on "retry" type error', async () => {
        let log: string[] = [];
        let retryCount = 0;

        const main = [
            () => async () => {
                if (retryCount < 2) {
                    retryCount++;
                    throw new WorkflowError("retry", "Retry error");
                } else {
                    log.push("main");
                }
            },
        ];

        const engine = new WorkflowEngine(main);
        await engine.run();

        expect(log).to.deep.equal(["main"]);
        expect(retryCount).to.equal(2);
    });

    it('should skip on "skip" type error', async () => {
        let log: string[] = [];

        const main = [
            () => async () => {
                throw new WorkflowError("skip", "Skip error");
            },
            () => async () => {
                log.push("main");
            },
        ];

        const engine = new WorkflowEngine(main);
        await engine.run();

        expect(log).to.deep.equal(["main"]);
    });

    it('should abort on "abort" type error', async () => {
        let log: string[] = [];

        const main = [
            () => async () => {
                throw new WorkflowError("abort", "Abort error");
            },
            () => async () => {
                log.push("main");
            },
        ];

        const engine = new WorkflowEngine(main);
        await engine.run();

        expect(log).to.deep.equal([]);
    });

    it("should allow a 'then' after run command", async () => {
        const engine = new WorkflowEngine([]);
        const result = engine.run();

        // Check if run() returns a Promise
        expect(result).to.be.an.instanceOf(Promise);

        let thenWorked = false;
        await result.then(() => {
            thenWorked = true;
        });

        expect(thenWorked).to.be.true;
    });

    it("should respect maxRetries option", async () => {
        let log: string[] = [];
        let executionCount = 0;

        const main = [
            () => async () => {
                if (executionCount < 4) {
                    executionCount++;
                    throw new WorkflowError("retry", "Retry error");
                } else {
                    log.push("main");
                }
            },
        ];

        const engine = new WorkflowEngine(main, { maxRetries: 2 }); // Setting maxRetries to 2
        await engine.run();

        expect(log).to.deep.equal([]); // Since maxRetries is 2, the promise should not be successful and "main" won't be logged
        expect(executionCount).to.equal(3); // Should only retry 2 times, so total executions is 3
    });
});
