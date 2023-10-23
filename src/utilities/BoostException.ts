export class BoostException extends Error {
    serviceResult: any;

    constructor(message?: string, name?: string, serviceResult?: any) {
        super(message);
        this.name = name?? "BoostException";
        this.serviceResult = serviceResult;
    }
    public get response(): any {
        return {
            data: this.serviceResult
        };
    }
}

export class BoostAuthenticationException extends BoostException {
    serviceResult: any;

    constructor(message?: string, serviceResult?: any) {
        super(message, "BoostAuthenticationException", serviceResult);
    }
}

export class BoostNetworkException extends BoostException {
    constructor(message?: string, serviceResult?: any) {
        super(message, "BoostNetworkException", serviceResult);
    }
}
