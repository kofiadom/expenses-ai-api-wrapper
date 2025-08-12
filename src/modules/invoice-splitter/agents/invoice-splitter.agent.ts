import { Logger } from '@nestjs/common';
import { Anthropic } from '@llamaindex/anthropic';
import { BedrockLlmService } from '../../../utils/bedrockLlm';
import { PageMarkdown, PageAnalysisResult } from '../types/invoice-splitter.types';

export class InvoiceSplitterAgent {
  private readonly logger = new Logger(InvoiceSplitterAgent.name);
  private llm: any;

  constructor(provider: 'bedrock' | 'anthropic' = 'bedrock') {
    this.logger.log(`Initializing InvoiceSplitterAgent with provider: ${provider}`);

    if (provider === 'bedrock') {
      this.llm = new BedrockLlmService();
    } else {
      this.llm = new Anthropic({
        apiKey: process.env.ANTHROPIC_KEY,
        model: 'claude-3-5-sonnet-20241022',
      });
    }
  }

  async analyzePages(pageMarkdowns: PageMarkdown[]): Promise<PageAnalysisResult> {
    try {
      this.logger.log(`Starting invoice analysis for ${pageMarkdowns.length} pages`);

      const prompt = this.buildPageAnalysisPrompt(pageMarkdowns);

      const response = await this.llm.chat({
        messages: [
          {
            role: 'system',
            content: `You are an expert document analyst specializing in individual receipt/invoice identification. Your primary expertise is detecting separate transactions within document containers and avoiding incorrect grouping.

CORE PRINCIPLE: Distinguish between DOCUMENT CONTAINERS and INDIVIDUAL TRANSACTIONS.

CRITICAL UNDERSTANDING:
- Document containers (expense reports, compilations) hold multiple separate transactions
- Container headers like "Nota spese n° 107" or "Expense Report #123" are NOT transaction identifiers
- Look for TRANSACTION-LEVEL identifiers within each page (receipt numbers, transaction times, totals)
- Each complete transaction should be treated as a separate receipt, regardless of container

Your analysis should be precise and methodical:
1. IGNORE document-level headers and focus on transaction-level details
2. Look for complete transaction cycles on individual pages
3. Identify unique transaction markers (receipt numbers, transaction times, totals, payment methods)
4. Separate receipts even if they share the same expense report number or vendor
5. Only group pages when there's clear evidence of multi-page continuation of the SAME transaction
6. When in doubt, separate rather than group - it's better to over-split than under-split

CRITICAL: Container headers are NOT reasons to group transactions together.

Always respond with valid JSON only - no explanations or markdown formatting.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Parse the JSON response
      let rawContent: string;
      if (typeof response.message.content === 'string') {
        rawContent = response.message.content;
      } else if (Array.isArray(response.message.content) && response.message.content.length > 0) {
        // Anthropic format: [{"type":"text","text":"actual JSON content"}]
        const firstItem = response.message.content[0];
        if (firstItem && firstItem.type === 'text' && firstItem.text) {
          rawContent = firstItem.text;
        } else {
          rawContent = JSON.stringify(response.message.content);
        }
      } else if (response.message.content && typeof response.message.content === 'object') {
        rawContent = JSON.stringify(response.message.content);
      } else {
        rawContent = String(response.message.content || '');
      }

      this.logger.debug(`Raw response: ${rawContent.substring(0, 300)}...`);

      const parsedResult = this.parseJsonResponse(rawContent);
      
      // Validate the structure
      if (!parsedResult.totalInvoices || !Array.isArray(parsedResult.pageGroups)) {
        throw new Error('Invalid response structure from LLM');
      }

      this.logger.log(`Invoice analysis completed: ${parsedResult.totalInvoices} invoices detected`);

      return parsedResult as PageAnalysisResult;
    } catch (error) {
      this.logger.error('Invoice analysis failed:', error);
      
      // Return fallback: treat all pages as single invoice
      return {
        totalInvoices: 1,
        pageGroups: [
          {
            invoiceNumber: 1,
            pages: pageMarkdowns.map(p => p.pageNumber),
            confidence: 0.3,
            reasoning: `Analysis failed (${error.message}), treating as single invoice`
          }
        ]
      };
    }
  }

  private buildPageAnalysisPrompt(pages: PageMarkdown[]): string {
    const pagesContent = pages.map(page => 
      `=== PAGE ${page.pageNumber} ===\n${page.content.substring(0, 2000)}${page.content.length > 2000 ? '...' : ''}\n`
    ).join('\n');

    return `Analyze these PDF pages to identify individual receipts/invoices. Each page could potentially be a separate receipt unless proven otherwise.

DOCUMENT PAGES:
${pagesContent}

ANALYSIS APPROACH:
1. ASSUME each page is a separate receipt/invoice by default
2. DISTINGUISH between document containers and individual transactions
3. Focus on TRANSACTION-LEVEL identifiers, not document-level headers
4. Look for COMPLETE TRANSACTION CYCLES on individual pages
5. Ignore container headers that appear across multiple transactions

CRITICAL: CONTAINER vs TRANSACTION DISTINCTION
- CONTAINER HEADERS: Expense report numbers, document titles, employee names, report dates
  Examples: "Nota spese n° 107", "Expense Report #2024-001", "John Smith Expenses"
  → These are DOCUMENT CONTAINERS, not transaction identifiers
  → IGNORE these for grouping decisions

- TRANSACTION IDENTIFIERS: Individual receipt numbers, store transaction IDs, timestamps
  Examples: "Receipt #12345", "Trans ID: 789", "Order #ABC123", specific transaction times
  → These identify INDIVIDUAL TRANSACTIONS within containers
  → USE these for grouping decisions

INDIVIDUAL RECEIPT INDICATORS (Each suggests a separate receipt):
- Complete transaction with total amount
- Separate date/time stamps (different transaction times)
- Different receipt/invoice numbers (transaction-level, not container-level)
- Different order/confirmation numbers
- Separate payment method information
- Different transaction IDs or reference numbers
- Complete item lists with subtotals and taxes
- Different store locations or addresses (even same brand)
- Separate "Thank you" or transaction completion messages
- Different customer information
- Standalone QR codes or barcodes
- Individual merchant signatures or stamps

GROUPING RULES FOR MULTI-PAGE RECEIPTS (Group when MOST criteria match):

STRONG INDICATORS (Any 2+ suggest same transaction):
- SAME exact TRANSACTION-LEVEL receipt/invoice number (not container number)
- SAME exact transaction date/time
- Clear continuation indicators: "Page 2 of 3", "Continued...", "See next page"
- Sequential page numbering within same document
- Incomplete transaction flow (no final total on early pages)
- Consistent customer/billing information
- Progressive totals (subtotal → tax → final total across pages)

MULTI-PAGE PATTERNS TO RECOGNIZE:
- "Page X of Y" or "Page X/Y"
- "Continued on next page" or "Continued..."
- Same invoice number with different page indicators
- Building totals: Page 1 shows subtotal, Page 2 shows taxes, Page 3 shows final total
- Consistent transaction context (same customer, same date, same vendor details)
- Sequential item listings that continue across pages

SEPARATION RULES (Always separate when ANY of these exist):
- Different TRANSACTION-LEVEL receipt/invoice numbers
- Different transaction dates or times (even same day)
- Complete transaction cycle on EACH page (full start-to-finish flow)
- Different payment methods or card numbers
- Different store numbers or locations
- Different customer names or details
- Individual transaction completion indicators ("Thank you", "Transaction complete")
- Separate merchant signatures or stamps
- Each page has its own final total (not building totals)
- Different billing/shipping addresses
- Standalone QR codes or barcodes on each page

TOTAL AMOUNT CONSIDERATIONS:
- If pages show BUILDING totals (subtotal → tax → final), likely same transaction
- If pages show DIFFERENT final totals, definitely separate transactions
- If only last page shows total, check other indicators for grouping
- Progressive calculations across pages suggest continuation

EXPENSE REPORT SPECIFIC RULES:
- If pages have expense report headers (like "Nota spese", "Expense Report") but different:
  → Transaction times/dates → SEPARATE
  → Receipt numbers → SEPARATE
  → Total amounts → SEPARATE
  → Store locations → SEPARATE
- Expense report numbers are CONTAINERS, not transaction identifiers
- Look WITHIN each page for individual transaction details
- Each receipt in an expense report should be treated separately

SPECIAL CASES TO WATCH FOR:
- Digital receipt compilations (multiple complete receipts from same vendor)
- Expense report collections (employee submitting multiple receipts under one report number)
- Receipt scanning app outputs (various receipts with app branding)
- Multi-location same brand receipts (different store numbers/addresses)
- Subscription billing (multiple months from same provider)
- E-commerce platform receipts (same platform, different sellers)

COMMON CONTAINER PATTERNS TO IGNORE FOR GROUPING:
- "Nota spese n° [number]" (Italian expense reports)
- "Expense Report #[number]"
- "Travel Expenses - [name/date]"
- "[Employee Name] Reimbursement"
- "Monthly Expenses [month/year]"
- Document compilation headers
- Scanning app watermarks or headers

CONFIDENCE SCORING:
- 0.9-1.0: Clear individual receipts with complete transaction cycles
- 0.7-0.8: Likely separate receipts with minor ambiguities
- 0.5-0.6: Possible separate receipts, some shared elements
- 0.3-0.4: Unclear boundaries, lean toward separation
- 0.0-0.2: Strong evidence for grouping (true multi-page invoice)

RESPONSE FORMAT (valid JSON only):
{
  "totalInvoices": 4,
  "pageGroups": [
    {
      "invoiceNumber": 1,
      "pages": [1],
      "confidence": 0.95,
      "reasoning": "Page 1: Individual receipt within expense report - Receipt #12345, total €15.50, 2024-01-15 09:30, Restaurant ABC"
    },
    {
      "invoiceNumber": 2,
      "pages": [2],
      "confidence": 0.92,
      "reasoning": "Page 2: Individual receipt within expense report - Receipt #67890, total €8.75, 2024-01-15 14:20, Cafe XYZ - different transaction"
    },
    {
      "invoiceNumber": 3,
      "pages": [3],
      "confidence": 0.90,
      "reasoning": "Page 3: Individual receipt within expense report - Receipt #11111, total €25.00, 2024-01-16 12:00, Hotel DEF - different date/amount"
    },
    {
      "invoiceNumber": 4,
      "pages": [4, 5],
      "confidence": 0.88,
      "reasoning": "Pages 4-5: Multi-page invoice #INV-2024-001, same invoice number, 'Page 1 of 2' indicator, building totals (subtotal on page 4, final total on page 5)"
    }
  ]
}

CRITICAL: Respond with ONLY the JSON object. No explanations, markdown formatting, or additional text.`;
  }

  private parseJsonResponse(content: string): any {
    try {
      // Remove markdown code blocks if present
      const cleanContent = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      return JSON.parse(cleanContent);
    } catch (error) {
      this.logger.error('Failed to parse JSON response:', error);
      throw new Error(`Invalid JSON response: ${error.message}`);
    }
  }
}
