trigger AccountTriggerGood on Account (before insert, before update, after insert) {
    // Delegate everything to the handler. [SELECT ...] and insert belong there.
    AccountTriggerHandler.handle(Trigger.new, Trigger.oldMap, Trigger.operationType);
}
