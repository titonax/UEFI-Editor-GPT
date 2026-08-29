import React from "react";
import s from "./App.module.css";
import { useImmer } from "use-immer";
import { Alert, AppShell, Button, Group, Stack } from "@mantine/core";
import type { Data } from "./components/scripts/types";
import FileUploads from "./components/FileUploads/FileUploads";
import { isPopulatedFiles, type Files } from "./components/FileUploads/fileModel";
import FormUi from "./components/FormUi/FormUi";
import Navigation from "./components/Navigation/Navigation";
import NavigationResizer from "./components/Navigation/NavigationResizer";
import Header from "./components/Header/Header";
import Footer from "./components/Footer/Footer";
import { IconBrandGithub } from "@tabler/icons-react";
import BiosImageUpload from "./components/BiosImageUpload/BiosImageUpload";
import { parseData } from "./components/scripts/scripts";

const emptyData: Data = {
  firmwareFamily: "aptio-v",
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
  const [error, setError] = React.useState("");
  const handleError = React.useCallback((message: string) => {
    setError(message);
  }, []);

  return (
    <>
      {data.version.length > 0 && isPopulatedFiles(files) ? (
        <>
          <AppShell.Navbar>
            <Navigation
              data={data}
              currentFormIndex={currentFormIndex}
              setCurrentFormIndex={setCurrentFormIndex}
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
            onExtracted={async (extractedFiles) => {
              setError("");
              setFiles(extractedFiles);
              const parsed = await parseData(extractedFiles);
              parsed.firmwareFamily = "aptio-iv";
              setData(parsed);
            }}
          />
          <FileUploads
            files={files}
            setFiles={setFiles}
            setData={setData}
            onError={handleError}
          />
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
