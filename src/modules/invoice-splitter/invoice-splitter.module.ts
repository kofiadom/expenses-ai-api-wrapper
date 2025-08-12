import { Module } from '@nestjs/common';
import { InvoiceSplitterController } from './invoice-splitter.controller';
import { InvoiceSplitterService } from './invoice-splitter.service';
import { InvoiceSplitterAgent } from './agents/invoice-splitter.agent';

@Module({
  controllers: [InvoiceSplitterController],
  providers: [
    InvoiceSplitterService,
    {
      provide: InvoiceSplitterAgent,
      useFactory: () => {
        // Use Bedrock as default provider with Anthropic fallback
        const provider: 'bedrock' | 'anthropic' = 'bedrock';
        return new InvoiceSplitterAgent(provider);
      },
    },
  ],
  exports: [InvoiceSplitterService],
})
export class InvoiceSplitterModule {}
