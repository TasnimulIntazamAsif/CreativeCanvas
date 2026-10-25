import { MidjourneyAccountBlock } from "./MidjourneyAccountBlock";
import { GrokAccountBlock } from "./GrokAccountBlock";

interface AccountSettingsPaneProps {
  globalAccountLogoutCallback: () => void;
}

// The ArtCraft account (login/logout) block is hidden while login is disabled.
export const AccountSettingsPane = (_props: AccountSettingsPaneProps) => {
  return (
    <div className="flex flex-col gap-5 pt-3 text-base-fg">
      <GrokAccountBlock />
      <hr className="border-ui-panel-border" />
      <MidjourneyAccountBlock />
    </div>
  );
};
