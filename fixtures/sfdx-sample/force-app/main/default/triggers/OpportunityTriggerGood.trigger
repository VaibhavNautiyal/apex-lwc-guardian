trigger OpportunityTriggerGood on Opportunity (before update) {
    // Trigger.new[0] only sees the first record, so loop over all of them.
    for (Opportunity opp : Trigger.new) {
        Opportunity previous = Trigger.oldMap.get(opp.Id);
        if (opp.Amount != previous.Amount) {
            OpportunityService.recalculate(opp);
        }
    }
}
