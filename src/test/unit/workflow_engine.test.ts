import { expect } from "chai";
import { PromiseGenerator, WorkflowEngine, WorkflowError } from "../../utilities/workflow_engine";

describe("WorkflowEngine", () => {
    it("should run promises in the correct order", async () => {
        let log: string[] = [];

        const beforeRun = [
            () => async () => {
                log.push("beforeRun");
                return;
            },
        ];
        const tasks = [
            () => async () => {
                log.push("main1");
                return 1;
            },
            () => async () => {
                log.push("main2");
                return 2;
            },
            () => async () => {
                log.push("main3");
                return 3;
            },
            () => async () => {
                log.push("main4");
                return 4;
            },
        ];
        const afterEachTask = [
            () => async () => {
                console.log(log);
                return;
            },
        ];
        const afterEachTaskGroup = [
            () => async () => {
                log.push("afterEachTaskGroup");
                return;
            },
        ];
        const afterRun = [
            () => async () => {
                log.push("afterRun");
                return;
            },
        ];

        const pattern = [1, 2];

        const engine = new WorkflowEngine(tasks, {
            beforeRun: beforeRun,
            afterEachTask: afterEachTask,
            afterEachTaskGroup: afterEachTaskGroup,
            afterRun: afterRun,
            pattern: pattern,
        });
        const allResults = await engine.run();

        expect(allResults.length).to.equal(3);

        expect(allResults[0].length).to.equal(1);
        expect(allResults[0][0]).to.equal(1);

        expect(allResults[1].length).to.equal(2);
        expect(allResults[1][0]).to.equal(2);
        expect(allResults[1][1]).to.equal(3);

        expect(allResults[2].length).to.equal(1);
        expect(allResults[2][0]).to.equal(4);

        expect(log).to.deep.equal([
            "beforeRun",
            "main1",
            "afterEachTaskGroup",
            "main2",
            "main3",
            "afterEachTaskGroup",
            "main4",
            "afterEachTaskGroup",
            "afterRun",
        ]);
    });

    it("Simulate N files processed in the correct order", async () => {
        let log: string[] = [];

        const beforeRun = [
            () => async () => {
                log.push("beforeRun");
                return;
            },
        ];
        const files = ["file1", "file2", "file3", "file4", "file5", "file6", "file7", "file8", "file9", "file10"];
        const tasks : PromiseGenerator[] =
            files.map((file) => {
                return () => {
                    return async () => {
                        return new Promise<string>(
                            (resolve, reject) => {
                                try
                                {
                                    log.push(`Processed: ${file}`);
                                    resolve(file);
                                } catch (error) {
                                    reject(error);
                                }
                            });
                        };
                    };
            });
        const afterEachTask = [
            () => async () => {
                console.log(log);
                return;
            },
        ];
        const afterEachTaskGroup = [
            () => async () => {
                log.push("afterEachTaskGroup");
                return;
            },
        ];
        const afterRun = [
            () => async () => {
                log.push("afterRun");
                return;
            },
        ];

        const pattern = [1, 2];

        const engine = new WorkflowEngine(tasks as PromiseGenerator[], {
            beforeRun: beforeRun,
            afterEachTask: afterEachTask,
            afterEachTaskGroup: afterEachTaskGroup,
            afterRun: afterRun,
            pattern: pattern,
        });
        await engine.run();

        expect(log).to.deep.equal(
            [
                "beforeRun",
                "Processed: file1",
                "afterEachTaskGroup",
                "Processed: file2",
                "Processed: file3",
                "afterEachTaskGroup",
                "Processed: file4",
                "Processed: file5",
                "afterEachTaskGroup",
                "Processed: file6",
                "Processed: file7",
                "afterEachTaskGroup",
                "Processed: file8",
                "Processed: file9",
                "afterEachTaskGroup",
                "Processed: file10",
                "afterEachTaskGroup",
                "afterRun",
            ]
        );
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
            afterEachTaskGroup: [summaryPromiseGenerator],
        });
        //run the engine
        await engine.run();
        //check the sum
        expect(sumCheck).to.equal(sum);
    });

    it('should retry on "retry" type error', async () => {
        let log: string[] = [];
        let retryCount = 0;

        const tasks = [
            () => async () => {
                if (retryCount < 2) {
                    retryCount++;
                    throw new WorkflowError("retry", "Retry error");
                } else {
                    log.push("main");
                    return "main";
                }
            },
        ];

        const engine = new WorkflowEngine(tasks);
        const allResults = await engine.run();

        expect(allResults.length).to.equal(1);
        expect(allResults[0].length).to.equal(1);
        expect(allResults[0][0]).to.equal("main");

        expect(log).to.deep.equal(["main"]);
        expect(retryCount).to.equal(2);
    });

    it('should retry on generic task error', async () => {
        let log: string[] = [];
        let retryCount = 0;

        const tasks = [
            () => async () => {
                if (retryCount < 2) {
                    retryCount++;
                    throw new Error("Test Generic Error retry");
                } else {
                    log.push("main");
                }
            },
        ];

        const engine = new WorkflowEngine(tasks);
        await engine.run();

        expect(log).to.deep.equal(["main"]);
        expect(retryCount).to.equal(2);
    });

    it('should skip on "skip" type error', async () => {
        let log: string[] = [];

        const tasks = [
            () => async () => {
                throw new WorkflowError("skip", "Skip error");
            },
            () => async () => {
                log.push("main");
                return "main";
            },
        ];

        const engine = new WorkflowEngine(tasks);
        const allResults = await engine.run();

        expect(allResults.length).to.equal(2);
        expect(allResults[0].length).to.equal(0);

        expect(allResults[1].length).to.equal(1);
        expect(allResults[1][0]).to.equal("main");

        expect(log).to.deep.equal(["main"]);
    });

    it('should abort on "abort" type error', async () => {
        let log: string[] = [];

        const tasks = [
            () => async () => {
                throw new WorkflowError("abort", "Abort error");
            },
            () => async () => {
                log.push("main");
            },
        ];

        const engine = new WorkflowEngine(tasks);
        const allResults = await engine.run();

        expect(allResults.length).to.equal(0);

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

    it("should respect maxRetries option with WorkflowError", async () => {
        let log: string[] = [];
        let executionCount = 0;

        const tasks = [
            () => async () => {
                if (executionCount < 4) {
                    executionCount++;
                    throw new WorkflowError("retry", "Retry error");
                } else {
                    log.push("main");
                }
            },
        ];

        const engine = new WorkflowEngine(tasks, { maxRetries: 1 }); // Setting maxRetries to 1 should only retry once
        await engine.run();
        expect(engine.currentTaskRetries).to.equal(0); // retry count should be reset

        expect(log).to.deep.equal([]); // Since maxRetries is 1, the promise should not be successful and "main" won't be logged
        expect(executionCount).to.equal(3); // Should only retry 1 times, so total executions is 3
    });

    it("should respect maxRetries option with Generic Error", async () => {
        let log: string[] = [];
        let executionCount = 0;

        const tasks = [
            () => async () => {
                if (executionCount < 4) {
                    executionCount++;
                    throw new Error("Unknown Error object - to test general retry");
                } else {
                    log.push("main");
                }
            },
        ];

        const engine = new WorkflowEngine(tasks, { maxRetries: 1 }); // Setting maxRetries to 1 should only retry once
        await engine.run();
        expect(engine.currentTaskRetries).to.equal(0); // retry count should be reset

        expect(log).to.deep.equal([]); // Since maxRetries is 1, the promise should not be successful and "main" won't be logged
        expect(executionCount).to.equal(3); // Should only retry 1 times, so total executions is 3
    });});
