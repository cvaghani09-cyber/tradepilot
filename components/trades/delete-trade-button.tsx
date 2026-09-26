"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { deleteTradesAction } from "@/app/actions/trades";

export function DeleteTradeButton({ tradeId }: { tradeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Delete trade" onClick={() => setOpen(true)}>
        <Trash2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Delete this trade?" description="Its executions, notes, tags and screenshots are removed. This can't be undone.">
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteTradesAction({ tradeIds: [tradeId] });
                  if (!r.ok) return void toast.error(r.error.message);
                  toast.success("Trade deleted");
                  router.push("/trades");
                })
              }
            >
              Delete trade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
