"""Exercise real native compilers and blocked stdin through the JSON bridge."""
import json
import os
from pathlib import Path
import select
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
BRIDGE = '''
import importlib.util,json,sys,tempfile
spec=importlib.util.spec_from_file_location('runner',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
original=m.tempfile.mkdtemp
m.tempfile.mkdtemp=lambda **kwargs: original(prefix=kwargs.get('prefix',''),dir=sys.argv[2])
request=json.loads(sys.stdin.readline())
result=m.run_native(request,(sys.stdin,sys.stdout))
print(json.dumps({'type':'result',**result}),flush=True)
'''

class NativeInputTests(unittest.TestCase):
    def run_code(self, language, code, answers=(), files=None):
        with tempfile.TemporaryDirectory() as directory:
            for name,content in (files or {}).items():
                (Path(directory)/name).write_text(content,encoding='utf-8')
            child=subprocess.Popen([sys.executable,'-u','-c',BRIDGE,str(ROOT/'sandbox/python/runner.py'),directory],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,cwd=directory)
            try:
                child.stdin.write(json.dumps({'language':language,'code':code,'interactive':True})+'\n');child.stdin.flush()
                events=[]
                for _ in range(25):
                    self.assertTrue(select.select([child.stdout],[],[],12)[0], 'Native input or result timed out')
                    line=child.stdout.readline()
                    if not line: self.fail(child.stderr.read())
                    event=json.loads(line)
                    if event['type']=='result':
                        child.wait(timeout=2)
                        return event,events
                    self.assertEqual(event['type'],'input')
                    self.assertLess(len(events),len(answers),'Unexpected input prompt')
                    child.stdin.write(json.dumps({'value':answers[len(events)]})+'\n');child.stdin.flush();events.append(event)
                self.fail('Too many events')
            finally:
                child.kill();child.wait()
                child.stdin.close();child.stdout.close();child.stderr.close()

    @unittest.skipUnless(shutil.which('gcc'), 'GCC unavailable')
    def test_c_scanf_and_prompt_without_newline(self):
        result,events=self.run_code('c','#include <stdio.h>\nint main(){int a,b; printf("first: "); scanf("%d",&a); printf("second: "); scanf("%d",&b); printf("sum=%d\\n",a+b);}', ['12','30'])
        self.assertTrue(result['success'],result);self.assertIn('sum=42',result['output']);self.assertEqual(len(events),2);self.assertIn('first:',events[0]['output'])

    @unittest.skipUnless(shutil.which('g++'), 'G++ unavailable')
    def test_cpp_cin_getline_chinese(self):
        result,events=self.run_code('cpp','#include <iostream>\n#include <string>\nint main(){std::string a,b; std::cin>>a; std::cin.ignore(); std::getline(std::cin,b); std::cout<<a<<":"<<b<<"\\n";}', ['小明','你好世界'])
        self.assertTrue(result['success'],result);self.assertIn('小明:你好世界',result['output']);self.assertEqual(len(events),2)

    @unittest.skipUnless(shutil.which('g++'), 'G++ unavailable')
    def test_long_line_is_not_truncated_by_terminal(self):
        value='x'*10000
        result,events=self.run_code('cpp','#include <iostream>\n#include <string>\nint main(){std::string s;std::getline(std::cin,s);std::cout<<s.size()<<"\\n";}',[value])
        self.assertTrue(result['success'],result);self.assertEqual(result['output'],'10000\n');self.assertEqual(len(events),1)

    @unittest.skipUnless(shutil.which('javac'), 'JDK unavailable')
    def test_java_scanner_public_class_and_package(self):
        result,events=self.run_code('java','package demo; import java.util.Scanner; public class Hello { public static void main(String[] args) { Scanner s=new Scanner(System.in); System.out.print("name: "); String n=s.nextLine(); System.out.print("age: "); int a=s.nextInt(); System.out.println(n+":"+a); }}',['小明','20'])
        self.assertTrue(result['success'],result);self.assertIn('小明:20',result['output']);self.assertEqual(len(events),2)

    @unittest.skipUnless(shutil.which('javac'), 'JDK unavailable')
    def test_java_reads_uploaded_file(self):
        result,events=self.run_code('java','import java.nio.file.*; public class Hello { public static void main(String[] args) throws Exception { System.out.print(Files.readString(Path.of("data.txt"))); }}',files={'data.txt':'上传中文数据'})
        self.assertTrue(result['success'],result);self.assertEqual(result['output'],'上传中文数据');self.assertEqual(events,[])

    @unittest.skipUnless(shutil.which('bash'), 'Bash unavailable')
    def test_shell_read_and_no_input_program(self):
        result,events=self.run_code('bash','read -p "name: " name; read -p "age: " age; printf "%s:%s\\n" "$name" "$age"',['小明','20'])
        self.assertTrue(result['success'],result);self.assertIn('小明:20',result['output']);self.assertEqual(len(events),2)
        result,events=self.run_code('sh','printf "done\\n"')
        self.assertTrue(result['success'],result);self.assertEqual(events,[]);self.assertEqual(result['output'],'done\n')

    @unittest.skipUnless(shutil.which('javac'), 'JDK unavailable')
    def test_java_compile_error_does_not_prompt(self):
        result,events=self.run_code('java','public class Hello { public static void main(String[] args) { missing(); }}')
        self.assertFalse(result['success']);self.assertEqual(result['phase'],'compile');self.assertEqual(result['errorLine'],1);self.assertEqual(events,[])

if __name__=='__main__': unittest.main()
