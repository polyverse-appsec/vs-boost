/*

the basic idea is the engine will take an array of promise generators, and run through them one at a time in serial until 
every promise is successfully resolved.  if a promise fails, then the promise generator is re-run and a new promise is put on the queue.  

the special behavior is that the main array of promises is to be run in groups, as specified by a pattern array.  
thus, if the pattern array is [1, 2, 4, 8], then the first promise is run, followed by *all* of the afterEachGroup promises, 
then two promises from the main array are run, followed by *all* of the afterEachGroup promises, then four promises are run and so forth.\

Initialization: The engine will be initialized with the following arrays of promise generators:
    before: Run at the very beginning of the workflow.
    main: The main group of promise generators.
    afterEachGroup: Run after every group, as specified by the pattern.
    after: Run at the end of the workflow.
    pattern: Specifies the grouping for the main array.

Running the Workflow:
First, the before promises will be run.
Then, the main promises will be run in groups specified by the pattern. After each group, all afterEachGroup promises are run.
If any promise in the main array fails, its generator is re-run, and a new promise is added to the queue.
Finally, the after promises will be run.
Abort: If the abort API is called, the workflow will stop executing further promises.
*/

// Custom error class for handling typed errors
export class WorkflowError extends Error {
    constructor(public type: "retry" | "skip" | "abort", message?: string) {
        super(message);
    }
}

export type PromiseGenerator = () => () => Promise<any>;
export type PromiseGeneratorWithInputs = () => (inputs: any[]) => Promise<any>;
export type BeforeRunPromiseGenerator = PromiseGenerator;
export type AfterEachTaskPromiseGenerator = PromiseGeneratorWithInputs;
export type AfterEachTaskGroupPromiseGenerator = PromiseGeneratorWithInputs;
export type AfterRunPromiseGenerator = PromiseGeneratorWithInputs;

export interface WorkflowEngineOptions {
    beforeRun?: BeforeRunPromiseGenerator[];
    afterEachTask?: AfterEachTaskPromiseGenerator[];
    afterEachTaskGroup?: AfterEachTaskGroupPromiseGenerator[];
    afterRun?: AfterRunPromiseGenerator[];
    pattern?: number[];
    logger?: any;
    maxRetries?: number;
}

export class WorkflowEngine {
    private beforeRun: BeforeRunPromiseGenerator[];
    private tasks: PromiseGenerator[];
    private afterEachTask: AfterEachTaskPromiseGenerator[];
    private afterEachTaskGroup: AfterEachTaskGroupPromiseGenerator[];
    private afterRun: AfterRunPromiseGenerator[];
    private pattern: number[];
    private aborted: boolean = false;
    private logger: any;
    private maxRetries: number;
    private retryCounts: Map<PromiseGenerator, number> = new Map(); // To keep track of retries for each promise generator

    constructor(tasks: PromiseGenerator[], options: WorkflowEngineOptions = {}) {
        this.beforeRun = options.beforeRun || [];
        this.tasks = [...tasks];
        this.afterEachTask = options.afterEachTask || [];
        this.afterEachTaskGroup = options.afterEachTaskGroup || [];
        this.afterRun = options.afterRun || [];
        this.pattern = options.pattern || [1, 2, 4, 8, 16];
        //default to a no-op function for logger if none is provided
        this.logger = options.logger || undefined;
        this.maxRetries = options.maxRetries || 5;
    }

    public async run() {
        this.aborted = false;
        try {
            await this.executePromises(this.beforeRun);
        } catch (error) {
            this.logger?.error(`Error running before promises: ${error}`);
            return;
        }
        let allResults: any[] = [];

        let groupIndex = 0;
        while (this.tasks.length > 0 && !this.aborted) {
            const groupSize =
                this.pattern[groupIndex] ||
                this.pattern[this.pattern.length - 1]; // Use the last group size if we've exceeded the pattern

            let groupResults: any[] = [];
            for (let i = 0; i < groupSize && this.tasks.length > 0; i++) {
                if (this.aborted) {
                    return allResults;
                }
                const promiseGenerator = this.tasks.shift()!;
                const promise = promiseGenerator();
                try {
                    let result = await promise();
                    groupResults.push(result);
                    await this.executePromisesWithInputs(this.afterEachTask, [
                        result,
                    ]);
                } catch (error) {
                    if (error instanceof WorkflowError) {
                        switch (error.type) {
                            case "retry":
                                const currentRetries =
                                    this.retryCounts.get(promiseGenerator) || 0;
                                if (currentRetries < this.maxRetries) {
                                    this.retryCounts.set(
                                        promiseGenerator,
                                        currentRetries + 1
                                    );
                                    this.tasks.push(promiseGenerator);
                                } else {
                                    this.logger?.info(
                                        `Max retries reached for promise ${promise.name}. Skipping.`
                                    );
                                }
                                break;
                            case "skip":
                                this.logger?.info(
                                    "Skipping promise " +
                                        promise.name +
                                        " due to error: " +
                                        error.message
                                );
                                // Just skip and continue
                                break;
                            case "abort":
                                this.logger?.error(
                                    "Aborting workflow due to error: " +
                                        error.message +
                                        "in promise " +
                                        promise.name
                                );
                                this.abort();
                                return allResults; // Exit the function immediately
                        }
                    } else {
                        // for a generic error, just try again
                        this.tasks.push(promiseGenerator); // Retry later
                    }
                }
            }

            await this.executePromisesWithInputs(
                this.afterEachTaskGroup,
                groupResults
            );

            // Move to the next group size if available
            if (groupIndex < this.pattern.length - 1) {
                groupIndex++;
            }
            allResults.push(groupResults);
        }
        try {
            await this.executePromisesWithInputs(this.afterRun, allResults);
        } catch (error) {
            this.logger?.error(`Error running after promises: ${error}`);
            return allResults;
        }
    }

    public abort() {
        this.aborted = true;
    }

    private async executePromises(promiseGenerators: PromiseGenerator[]) {
        for (let generatorFactory of promiseGenerators) {
            if (this.aborted) {
                return;
            }
            const generator = generatorFactory();
            await generator();
        }
    }

    private async executePromisesWithInputs(
        promiseGenerators: PromiseGeneratorWithInputs[],
        inputs: any[]
    ) {
        for (let generatorFactory of promiseGenerators) {
            if (this.aborted) {
                return;
            }
            const generator = generatorFactory();
            await generator(inputs);
        }
    }
}
