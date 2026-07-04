'use client';
/**
 * @fileOverview An AI chat assistant that can draft messages, summarize conversations, and answer questions.
 *
 * - aiChatAssistant - A function that handles interactions with the AI chat assistant.
 * - AIChatAssistantInput - The input type for the aiChatAssistant function.
 * - AIChatAssistantOutput - The return type for the aiChatAssistant function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AIChatAssistantInputSchema = z.object({
  userPrompt: z.string().describe('The user\u0027s query or instruction for the AI.'),
  chatHistory: z.array(
    z.object({
      role: z.enum(['user', 'model']).describe('The role of the message sender.'),
      content: z.string().describe('The content of the message.'),
    })
  ).optional().describe('Optional chat history for context, ordered from oldest to newest.'),
});
export type AIChatAssistantInput = z.infer<typeof AIChatAssistantInputSchema>;

const AIChatAssistantOutputSchema = z.object({
  response: z.string().describe('The AI\u0027s generated response.'),
});
export type AIChatAssistantOutput = z.infer<typeof AIChatAssistantOutputSchema>;

export async function aiChatAssistant(input: AIChatAssistantInput): Promise<AIChatAssistantOutput> {
  return aiChatAssistantFlow(input);
}

const aiChatAssistantPrompt = ai.definePrompt({
  name: 'aiChatAssistantPrompt',
  input: {schema: AIChatAssistantInputSchema},
  output: {schema: AIChatAssistantOutputSchema},
  prompt: `You are a helpful and professional AI chat assistant named My Messenger AI. Your goal is to assist the user with tasks like drafting messages, summarizing conversations, or answering questions based on the provided context.

{{#if chatHistory}}
Here is the recent chat history for context:
{{#each chatHistory}}
{{this.role}}: {{{this.content}}}
{{/each}}
{{/if}}

User's Request: {{{userPrompt}}}

Please provide a clear and concise response based on the user's request and the chat history if provided. If the request is to draft a message, provide only the draft message.`,
});

const aiChatAssistantFlow = ai.defineFlow(
  {
    name: 'aiChatAssistantFlow',
    inputSchema: AIChatAssistantInputSchema,
    outputSchema: AIChatAssistantOutputSchema,
  },
  async (input) => {
    const {output} = await aiChatAssistantPrompt(input);
    if (!output) {
      throw new Error('AI did not provide a response.');
    }
    return output;
  }
);
