import { truncate } from "lodash";
import OpenAI from "openai";

const openai = new OpenAI();

export async function generateQuickDescription(code: string): Promise<string> {
    let result = "";
    //limit the code to 8000 characters
    const truncatedCode = truncate(code, {length: 8000});
    const stream = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
            { role: "system", content: "You are a system architect documenting the specification of code. Your reponses are concise and include architecturally relevant details." },
            { role: "user", content: "Please summarize the following code in a paragraph or less: " + truncatedCode },
        ],
        stream: true,
    });
    for await (const part of stream) {
        //console.log(part.choices[0]?.delta?.content || "");
        result += part.choices[0]?.delta?.content || "";
    }
    console.log("final result is: " + result);
    return result;
}
