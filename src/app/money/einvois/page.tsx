import { EInvoisPack } from "../einvois-pack";
import { FromAiNote } from "@/components/from-ai-note";

// Step 4 of the /money flow: the month-end e-Invois file for LHDN.
export default function MoneyEInvoisPage() {
  return (
    <>
      {/* F-6: the assistant's e-Invois button lands here with ?dari=ai. */}
      <FromAiNote
        bm="di sinilah fail e-Invois hujung bulan dijana untuk dimuat naik."
        zh="在这里生成月底的 e-Invois 上传文件。"
        en="this is where the month-end e-Invois upload file is generated."
      />
      <EInvoisPack />
    </>
  );
}
