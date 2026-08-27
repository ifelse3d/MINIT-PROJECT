import { RegisterAndReceipts } from "../register-receipts";
import { FromAiNote } from "@/components/from-ai-note";

// Step 2 of the /money flow: the register, and turning it into receipts.
export default function MoneyReceiptsPage() {
  return (
    <>
      {/* F-6: the assistant's "issue receipts" button lands here with ?dari=ai. */}
      <FromAiNote
        bm="di sinilah anda mengeluarkan resit bernombor untuk derma yang disahkan."
        zh="在这里为已确认的捐款开出编号收据。"
        en="this is where numbered receipts are issued for confirmed donations."
      />
      <RegisterAndReceipts />
    </>
  );
}
