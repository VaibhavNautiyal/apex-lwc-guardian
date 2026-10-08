trigger OpportunityTriggerBad on Opportunity (before update) {
    Opportunity opp = Trigger.new[0];
    Opportunity previous = Trigger.old[0];
    if (opp.Amount != previous.Amount) {
        OpportunityService.recalculate(opp);
    }
}
