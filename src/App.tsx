import React from "react";
import s from "./App.module.css";
import { useImmer } from "use-immer";
import { Alert, AppShell, Button, Divider, Group, Stack } from "@mantine/core";
import type { Data } from "./components/scripts/types";
import { isPopulatedFiles, type Files } from "./components/firmwareFiles";
import FormUi from "./components/FormUi/FormUi";
import Navigation from "./components/Navigation/Navigation";
import NavigationResizer from "./components/Navigation/NavigationResizer";
import Header from "./components/Header/Header";
import Footer from "./components/Footer/Footer";
import { IconBrandGithub } from "@tabler/icons-react";
import BiosImageUpload, {
  type PhoenixEditorSession,
  type UefiHiiEditorSession,
} from "./components/BiosImageUpload/BiosImageUpload";
import CorpusRunner from "./components/CorpusRunner/CorpusRunner";
import { parseData } from "./components/scripts/scripts";
import PhoenixNavigation from "./components/PhoenixEditor/PhoenixNavigation";
import PhoenixHeader from "./components/PhoenixEditor/PhoenixHeader";
import PhoenixFormUi from "./components/PhoenixEditor/PhoenixFormUi";
import PhoenixFooter from "./components/PhoenixEditor/PhoenixFooter";
import UefiHiiFooter from "./components/UefiHiiEditor/UefiHiiFooter";
import { bytesToHex } from "./components/scripts/hex";
import type { PhoenixSetupItem } from "./components/scripts/phoenixSetupTable";

const emptyData: Data = {
  firmwareFamily: "ami-aptio",
  menu: [],
  forms: [],
  varStores: [],
  suppressions: [],
  version: "",
  hashes: {
    setupTxt: "",
    setupSct: "",
    amitseSct: "",
    setupdataBin: "",
    offsetChecksum: "",
  },
};

interface AppProps {
  navigationWidth: number;
  navigationMinWidth: number;
  navigationMaxWidth: number;
  onNavigationWidthChange: (width: number) => void;
  onNavigationWidthReset: () => void;
}

export default function App({
  navigationWidth,
  navigationMinWidth,
  navigationMaxWidth,
  onNavigationWidthChange,
  onNavigationWidthReset,
}: AppProps) {
  const [files, setFiles] = useImmer<Files>({
    setupSctContainer: { isWrongFile: false },
    setupTxtContainer: { isWrongFile: false },
    amitseSctContainer: { isWrongFile: false },
    setupdataBinContainer: { isWrongFile: false },
  });

  const [data, setData] = useImmer<Data>(emptyData);

  const [currentFormIndex, setCurrentFormIndex] = React.useState(-1);
  const [phoenixSession, setPhoenixSession] =
    React.useState<PhoenixEditorSession | null>(null);
  const [uefiHiiSession, setUefiHiiSession] =
    React.useState<UefiHiiEditorSession | null>(null);
  const [currentPhoenixSection, setCurrentPhoenixSection] = React.useState(-1);
  const [phoenixForcedVisibleOffsets, setPhoenixForcedVisibleOffsets] = React.useState<
    number[]
  >([]);
  const [error, setError] = React.useState("");
  const handleError = React.useCallback((message: string) => {
    setError(message);
  }, []);

  return (
    <>
      {uefiHiiSession ? (
        <>
          <AppShell.Navbar>
            <Navigation
              data={data}
              currentFormIndex={currentFormIndex}
              setCurrentFormIndex={setCurrentFormIndex}
              setData={setData}
              originalSetupSct={bytesToHex(uefiHiiSession.workspace.sourceBytes)}
            />
            <NavigationResizer
              width={navigationWidth}
              minWidth={navigationMinWidth}
              maxWidth={navigationMaxWidth}
              onChange={onNavigationWidthChange}
              onReset={onNavigationWidthReset}
            />
          </AppShell.Navbar>
          <AppShell.Header>
            <Header
              data={data}
              fileName={uefiHiiSession.fileName}
              currentFormIndex={currentFormIndex}
              setCurrentFormIndex={setCurrentFormIndex}
            />
          </AppShell.Header>
          <AppShell.Footer>
            <UefiHiiFooter
              moduleCount={uefiHiiSession.workspace.modules.length}
              warningCount={uefiHiiSession.workspace.warnings.length}
              data={data}
              workspace={uefiHiiSession.workspace}
              onClose={() => {
                setUefiHiiSession(null);
                setData(emptyData);
                setCurrentFormIndex(-1);
              }}
            />
          </AppShell.Footer>
          <AppShell.Main>
            <FormUi
              data={data}
              setData={setData}
              originalSetupSct={bytesToHex(uefiHiiSession.workspace.sourceBytes)}
              currentFormIndex={currentFormIndex}
              setCurrentFormIndex={setCurrentFormIndex}
              readOnly
              navigationEditable
            />
          </AppShell.Main>
        </>
      ) : phoenixSession ? (
        <>
          <AppShell.Navbar>
            <PhoenixNavigation
              menu={phoenixSession.inventory.menu}
              currentSectionIndex={currentPhoenixSection}
              setCurrentSectionIndex={setCurrentPhoenixSection}
            />
            <NavigationResizer
              width={navigationWidth}
              minWidth={navigationMinWidth}
              maxWidth={navigationMaxWidth}
              onChange={onNavigationWidthChange}
              onReset={onNavigationWidthReset}
            />
          </AppShell.Navbar>
          <AppShell.Header>
            <PhoenixHeader
              fileName={phoenixSession.fileName}
              menu={phoenixSession.inventory.menu}
              currentSectionIndex={currentPhoenixSection}
            />
          </AppShell.Header>
          <AppShell.Footer>
            <PhoenixFooter
              templat={phoenixSession.inventory.templat}
              forcedVisibleItems={phoenixSession.inventory.menu.sections
                .flatMap((section) => section.items)
                .filter((item) => phoenixForcedVisibleOffsets.includes(item.offset))}
              onReset={() => {
                setPhoenixForcedVisibleOffsets([]);
              }}
              onClose={() => {
                setPhoenixSession(null);
                setCurrentPhoenixSection(-1);
                setPhoenixForcedVisibleOffsets([]);
              }}
            />
          </AppShell.Footer>
          <AppShell.Main>
            <PhoenixFormUi
              menu={phoenixSession.inventory.menu}
              templat={phoenixSession.inventory.templat}
              currentSectionIndex={currentPhoenixSection}
              forcedVisibleOffsets={phoenixForcedVisibleOffsets}
              onToggleVisibility={(item: PhoenixSetupItem) => {
                setPhoenixForcedVisibleOffsets((current) =>
                  current.includes(item.offset)
                    ? current.filter((offset) => offset !== item.offset)
                    : [...current, item.offset],
                );
              }}
            />
          </AppShell.Main>
        </>
      ) : data.version.length > 0 && isPopulatedFiles(files) ? (
        <>
          <AppShell.Navbar>
            <Navigation
              data={data}
              currentFormIndex={currentFormIndex}
              setCurrentFormIndex={setCurrentFormIndex}
              setData={setData}
              originalSetupSct={files.setupSctContainer.textContent}
            />
            <NavigationResizer
              width={navigationWidth}
              minWidth={navigationMinWidth}
              maxWidth={navigationMaxWidth}
              onChange={onNavigationWidthChange}
              onReset={onNavigationWidthReset}
            />
          </AppShell.Navbar>
          <AppShell.Header>
            <Header
              data={data}
              fileName={
                files.firmwareSource?.fileName ?? files.setupSctContainer.file.name
              }
              currentFormIndex={currentFormIndex}
              setCurrentFormIndex={setCurrentFormIndex}
            />
          </AppShell.Header>
          <AppShell.Footer>
            <Footer
              currentFormIndex={currentFormIndex}
              files={files}
              data={data}
              setData={setData}
              onError={handleError}
            />
          </AppShell.Footer>
          <AppShell.Main>
            <FormUi
              data={data}
              setData={setData}
              originalSetupSct={files.setupSctContainer.textContent}
              currentFormIndex={currentFormIndex}
              setCurrentFormIndex={setCurrentFormIndex}
            />
          </AppShell.Main>
        </>
      ) : (
        <Stack className={s.padding} gap="xl">
          {error.length > 0 && (
            <Alert color="red" title="The firmware could not be loaded">
              {error}
            </Alert>
          )}
          <BiosImageUpload
            onUefiHiiExtracted={(session) => {
              setData(session.workspace.data);
              setUefiHiiSession(session);
              setCurrentFormIndex(-1);
            }}
            onPhoenixExtracted={(session) => {
              setPhoenixSession(session);
              setCurrentPhoenixSection(-1);
              setPhoenixForcedVisibleOffsets([]);
            }}
            onExtracted={async (extractedFiles) => {
              setError("");
              setFiles(extractedFiles);
              const parsed = await parseData(extractedFiles);
              setData(parsed);
            }}
          />
          <Divider label="Or measure a local firmware corpus" />
          <CorpusRunner />
          <Group justify="center">
            <Button
              variant="default"
              size="lg"
              component="a"
              href="https://github.com/titonax/UEFI-Editor-GPT#usage"
              target="_blank"
              leftSection={<IconBrandGithub />}
            >
              Usage guide
            </Button>
            <Button
              variant="default"
              size="lg"
              component="a"
              href="https://github.com/titonax/UEFI-Editor-GPT/issues"
              target="_blank"
              leftSection={<IconBrandGithub />}
            >
              Report a bug
            </Button>
          </Group>
        </Stack>
      )}
    </>
  );
}
