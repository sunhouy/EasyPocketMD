package cn.yhsun.md

import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.*
import androidx.appcompat.app.AlertDialog
import com.google.android.material.checkbox.MaterialCheckBox
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference

/** Recycled file cards and lazily expanded native settings; no WebView UI duplication. */
object NativeWorkspace : android.app.Application.ActivityLifecycleCallbacks {
    private var application:android.app.Application?=null
    private var owner=WeakReference<Activity>(null)
    private var home: Home?=null
    private var setting: AlertDialog?=null
    private var more: AlertDialog?=null
    private val groups=mutableMapOf<String,Boolean>()
    private var homeSignature=""
    private var settingsSignature=""
    private var menuSignature=""
    private var epoch=0L
    private var dark=false
    private var lastToast=0L
    private fun emit(activity:Activity,kind:String,values:Map<String,Any?> = emptyMap()) {
        val data=JSONObject().put("kind",kind).put("epoch",epoch);values.forEach { (key,value)->data.put(key,value) };NativeNavigation.emit(activity,data)
    }
    private fun vertical(context:Context)=LinearLayout(context).apply { orientation=LinearLayout.VERTICAL }
    private fun row(context:Context)=LinearLayout(context).apply { orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL }
    private fun padding(view:View,size:Int=16) { val p=NativeMaterial.dp(view.context,size);view.setPadding(p,p,p,p) }
    fun update(activity:Activity,model:JSONObject) {
        if(owner.get()!==activity){application?.unregisterActivityLifecycleCallbacks(this);application=activity.application;application!!.registerActivityLifecycleCallbacks(this)}
        val newEpoch=model.optLong("epoch")
        if(owner.get()!==activity || dark!=model.optBoolean("night") || epoch!=newEpoch) {
            close();owner=WeakReference(activity);dark=model.optBoolean("night");epoch=newEpoch
        }
        NativeMaterial.configure(dark,model.optString("palette"))
        val homeModel=model.optJSONObject("home")
        if(homeModel==null){home?.hide()}
        else {if(home==null){home=Home(activity,NativeMaterial.context(activity,dark));homeSignature=""};if(homeSignature!=homeModel.toString()){home!!.update(homeModel);homeSignature=homeModel.toString()};home!!.show()}
        val config=model.optJSONObject("settings")
        if(config==null){setting?.dismiss();setting=null;settingsSignature="";groups.clear()}
        else if(settingsSchema(config)!=settingsSignature || setting?.isShowing!=true) {
            // Text input events do not rebuild the form; dependent controls refresh on change.
            val oldScroll=setting?.window?.decorView?.findViewWithTag<ScrollView>("settings-scroll")?.scrollY ?: 0
            setting?.setOnCancelListener(null);setting?.dismiss();settingsSignature=settingsSchema(config)
            setting=settings(activity,config,oldScroll);setting!!.show()
        }
        val menu=model.optJSONObject("more")
        if(menu==null){more?.setOnDismissListener(null);more?.setOnCancelListener(null);more?.dismiss();more=null;menuSignature=""}
        else if(menu.toString()!=menuSignature){more?.setOnDismissListener(null);more?.dismiss();menuSignature=menu.toString();more=menu(activity,menu);more!!.show()}
        val toast=model.optJSONObject("toast")
        if(toast!=null && toast.optLong("id")!=lastToast){lastToast=toast.optLong("id");Toast.makeText(activity,toast.optString("message"),Toast.LENGTH_SHORT).show()}
    }
    fun close() {home?.dismiss();setting?.setOnCancelListener(null);setting?.dismiss();more?.setOnDismissListener(null);more?.setOnCancelListener(null);more?.dismiss();home=null;setting=null;more=null;settingsSignature="";menuSignature=""}

    override fun onActivityDestroyed(activity:Activity){if(owner.get()===activity){NativeNavigation.reset();close();application?.unregisterActivityLifecycleCallbacks(this);application=null;owner=WeakReference(null)}}
    override fun onActivityCreated(activity:Activity,state:Bundle?){}
    override fun onActivityStarted(activity:Activity){}
    override fun onActivityResumed(activity:Activity){}
    override fun onActivityPaused(activity:Activity){}
    override fun onActivityStopped(activity:Activity){}
    override fun onActivitySaveInstanceState(activity:Activity,state:Bundle){}

    private fun settingsSchema(value:JSONObject):String {
        val copy=JSONObject(value.toString())
        fun clean(node:JSONObject) {
            if(node.optString("type")=="input")node.remove("value")
            val children=node.optJSONArray("children") ?: return
            for(index in 0 until children.length())clean(children.getJSONObject(index))
        }
        clean(copy);return copy.toString()
    }

    private class Home(private val activity:Activity,context:Context):Dialog(context) {
        private val root=vertical(context)
        private val title=NativeMaterial.label(context,"EasyPocketMD",28f)
        private val searchHolder=vertical(context)
        private val search=NativeMaterial.field(searchHolder,"","搜索文件")
        private val tabs=LinearLayout(context)
        private val tabScroll=HorizontalScrollView(context).apply { isHorizontalScrollBarEnabled=false;addView(tabs) }
        private val list=ListView(context).apply { divider=null;dividerHeight=0;clipToPadding=false;padding(this,4) }
        private val footer=vertical(context)
        private val placeholder=vertical(context).apply {gravity=Gravity.CENTER}
        private val empty=NativeMaterial.label(context,"",16f).apply {gravity=Gravity.CENTER}
        private val progress=com.google.android.material.progressindicator.CircularProgressIndicator(context).apply {isIndeterminate=true;setIndicatorColor(NativeMaterial.primary)}
        private val frame=FrameLayout(context)
        private var model=JSONObject()
        private var applying=false
        private var records=JSONArray()
        private val adapter=object:BaseAdapter() {
            override fun getCount()=(records.length()+1)/2
            override fun getItem(position:Int)=records.optJSONObject(position*2)
            override fun getItemId(position:Int)=position.toLong()
            override fun getView(position:Int,convertView:View?,parent:ViewGroup):View {
                val pair=(convertView as? LinearLayout) ?: row(context)
                pair.removeAllViews()
                for(column in 0..1) {
                    val record=records.optJSONObject(position*2+column)
                    if(record==null){pair.addView(View(context),LinearLayout.LayoutParams(0,NativeMaterial.dp(context,210),1f));continue}
                    val card=vertical(context);padding(card)
                    card.background=NativeMaterial.background(context,if(record.optBoolean("selected"))NativeMaterial.selected else NativeMaterial.container,20,record.optBoolean("selected"))
                    val name=NativeMaterial.label(context,record.optString("name"),16f).apply {maxLines=2;setTypeface(typeface,android.graphics.Typeface.BOLD)}
                    val heading=row(context);heading.addView(name,LinearLayout.LayoutParams(0,-2,1f))
                    if(record.optBoolean("pinned"))heading.addView(NativeMaterial.icon(context,"\uf10d","置顶"){}.apply {textSize=16f;isClickable=false;isFocusable=false},LinearLayout.LayoutParams(NativeMaterial.dp(context,20),NativeMaterial.dp(context,24)))
                    if(record.optBoolean("locked"))heading.addView(NativeMaterial.icon(context,"\ue897","加密"){}.apply {textSize=16f;isClickable=false;isFocusable=false},LinearLayout.LayoutParams(NativeMaterial.dp(context,20),NativeMaterial.dp(context,24)))
                    val status=record.optString("status")
                    if(status.isNotBlank())heading.addView(NativeMaterial.icon(context,if(status=="synced")"\ue86c" else if(status=="conflict")"\ue002" else "\ue2bd",status) {
                        if(status=="conflict")emit(activity,"home-action",mapOf("action" to "conflict","id" to record.optString("id")))
                    }.apply {textSize=16f;isClickable=status=="conflict";setTextColor(if(status=="synced")Color.rgb(70,157,91) else NativeMaterial.muted)},LinearLayout.LayoutParams(NativeMaterial.dp(context,20),NativeMaterial.dp(context,24)))
                    card.addView(heading)
                    if(record.optBoolean("local"))card.addView(NativeMaterial.label(context,if(model.optBoolean("english"))"Local" else "本地",11f).apply {setTextColor(NativeMaterial.primary)})
                    card.addView(NativeMaterial.label(context,if(record.optString("type")=="folder")if(model.optBoolean("english"))"Folder" else "文件夹" else record.optString("preview"),14f).apply {setTextColor(NativeMaterial.muted);maxLines=5;ellipsize=android.text.TextUtils.TruncateAt.END},LinearLayout.LayoutParams(-1,0,1f))
                    card.addView(NativeMaterial.label(context,record.optString("date"),11f).apply {setTextColor(NativeMaterial.muted)})
                    card.setOnClickListener {emit(activity,"file",mapOf("id" to record.optString("id")))}
                    card.setOnLongClickListener {emit(activity,"file",mapOf("id" to record.optString("id"),"longPress" to true));true}
                    pair.addView(card,LinearLayout.LayoutParams(0,NativeMaterial.dp(context,210),1f).apply {setMargins(6,6,6,6)})
                }
                return pair
            }
        }
        init {
            window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN)
            root.isFocusableInTouchMode=true;root.requestFocus()
            root.setBackgroundColor(NativeMaterial.surface)
            (search.parent as? com.google.android.material.textfield.TextInputLayout)?.apply {
                isHintEnabled=false;setBoxCornerRadii(NativeMaterial.dp(context,28).toFloat(),NativeMaterial.dp(context,28).toFloat(),NativeMaterial.dp(context,28).toFloat(),NativeMaterial.dp(context,28).toFloat());boxStrokeWidth=0;boxStrokeWidthFocused=0
            }
            val header=row(context);padding(header,12);header.addView(title,LinearLayout.LayoutParams(0,-2,1f))
            header.addView(NativeMaterial.icon(context,"\ue8b8","设置"){emit(activity,"home-action",mapOf("action" to "settings"))})
            header.addView(NativeMaterial.icon(context,"\ue853","登录与账户管理"){emit(activity,"home-action",mapOf("action" to "account"))})
            root.addView(header);padding(searchHolder,12);root.addView(searchHolder);root.addView(tabScroll)
            list.setOnScrollListener(object:AbsListView.OnScrollListener {
                override fun onScrollStateChanged(view:AbsListView?,state:Int){}
                override fun onScroll(view:AbsListView?,first:Int,count:Int,total:Int){emit(activity,"viewport",mapOf("limit" to (first+count)*2+16))}
            })
            list.adapter=adapter;root.addView(list,LinearLayout.LayoutParams(-1,0,1f));placeholder.addView(progress);placeholder.addView(empty);root.addView(placeholder,LinearLayout.LayoutParams(-1,0,1f));list.emptyView=placeholder;root.addView(footer)
            frame.addView(root,FrameLayout.LayoutParams(-1,-1))
            val create=NativeMaterial.icon(context,"\ue145","新建") {emit(activity,"home-action",mapOf("action" to "create"))}
            create.setTextColor(Color.WHITE);create.background=NativeMaterial.background(context,NativeMaterial.primary,28)
            frame.addView(create,FrameLayout.LayoutParams(NativeMaterial.dp(context,56),NativeMaterial.dp(context,56),Gravity.END or Gravity.BOTTOM).apply {setMargins(0,0,NativeMaterial.dp(context,20),NativeMaterial.dp(context,24))});create.tag="create"
            setContentView(frame);setCanceledOnTouchOutside(false)
            search.addTextChangedListener(object:TextWatcher {
                override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
                override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){if(!applying)emit(activity,"filter",mapOf("folder" to model.opt("folder").takeUnless {it==JSONObject.NULL},"query" to s.toString()))}
                override fun afterTextChanged(s:Editable?){}
            })
        }
        override fun onStart(){super.onStart();window?.setBackgroundDrawableResource(android.R.color.transparent);window?.setLayout(-1,-1)}
        @Deprecated("Compat Back dispatch") override fun onBackPressed() {
            if(model.optBoolean("selecting")){emit(activity,"home-action",mapOf("action" to "cancel"));return}
            if(!model.isNull("folder")){emit(activity,"filter",mapOf("folder" to null,"query" to ""));return}
            NativeNavigation.back(activity)
        }
        fun update(value:JSONObject) {
            model=value;applying=true
            progress.visibility=if(model.optBoolean("loading"))View.VISIBLE else View.GONE
            empty.text=if(model.optBoolean("loading"))if(model.optBoolean("english"))"Loading files…" else "正在加载文件…" else if(model.optString("query").isNotBlank())if(model.optBoolean("english"))"No results" else "没有搜索结果" else if(model.optBoolean("english"))"No files yet" else "还没有文件"
            val query=model.optString("query");if(search.text.toString()!=query){search.setText(query);search.setSelection(query.length)}
            search.hint=if(model.optBoolean("english"))"Search files" else "搜索文件"
            applying=false;val left=tabScroll.scrollX;tabs.removeAllViews()
            fun tab(name:String,path:String?,pinned:Boolean=false,id:String?=null){val button=NativeMaterial.button(context,name);
                if(pinned){button.icon=NativeMaterial.drawable(context,"\uf10d",NativeMaterial.primary);button.iconGravity=com.google.android.material.button.MaterialButton.ICON_GRAVITY_TEXT_END;button.iconTint=android.content.res.ColorStateList.valueOf(NativeMaterial.primary)}
                val current=model.opt("folder").takeUnless {it==JSONObject.NULL};if(current==path){button.backgroundTintList=android.content.res.ColorStateList.valueOf(NativeMaterial.selected);button.setTextColor(NativeMaterial.primaryText)}
                button.setOnClickListener {if(model.optBoolean("selecting") && id!=null)emit(activity,"file",mapOf("id" to id)) else emit(activity,"filter",mapOf("folder" to path,"query" to model.optString("query")))}
                if(id!=null)button.setOnLongClickListener {emit(activity,"file",mapOf("id" to id,"longPress" to true));true};tabs.addView(button)}
            tab(if(model.optBoolean("english"))"All" else "全部",null)
            val folders=model.optJSONArray("folders") ?: JSONArray();for(index in 0 until folders.length()){val folder=folders.getJSONObject(index);tab(folder.optString("name"),folder.optString("name"),folder.optBoolean("pinned"),folder.optString("id"))}
            tabScroll.post {tabScroll.scrollTo(left,0)}
            val first=list.firstVisiblePosition;val top=list.getChildAt(0)?.top ?: 0
            records=model.optJSONArray("items") ?: JSONArray();adapter.notifyDataSetChanged();list.setSelectionFromTop(first,top)
            footer.removeAllViews();frame.findViewWithTag<View>("create").visibility=if(model.optBoolean("selecting") || model.optBoolean("loading"))View.GONE else View.VISIBLE
            if(model.optBoolean("selecting")) {
                val controls=row(context);controls.addView(NativeMaterial.label(context,if(model.optBoolean("english"))"${model.optInt("count")} selected" else "${model.optInt("count")} 已选择"),LinearLayout.LayoutParams(0,-2,1f))
                for(action in listOf("all","cancel"))controls.addView(NativeMaterial.button(context,if(model.optBoolean("english"))if(action=="all")"Select all" else "Cancel" else if(action=="all")"全选" else "取消").apply {setOnClickListener {emit(activity,"home-action",mapOf("action" to action))}})
                footer.addView(controls)
                val actions=model.optJSONArray("actions") ?: JSONArray();val buttons=GridLayout(context).apply {columnCount=5}
                for(index in 0 until actions.length()){
                    val action=actions.getJSONObject(index);val id=action.optString("action")
                    buttons.addView(tile(context,id,action.optString("label"),!action.optBoolean("disabled")) {emit(activity,"home-action",mapOf("action" to id))},GridLayout.LayoutParams().apply {width=0;columnSpec=GridLayout.spec(GridLayout.UNDEFINED,1f);setMargins(2,2,2,2)})
                };footer.addView(buttons)
            }
        }
    }
    private fun settings(activity:Activity,model:JSONObject,position:Int):AlertDialog {
        val context=NativeMaterial.context(activity,dark);val layout=vertical(context);padding(layout,20)
        renderNodes(activity,layout,model.optJSONArray("children") ?: JSONArray())
        val scroll=ScrollView(context).apply {tag="settings-scroll";addView(layout);post {scrollTo(0,position)}}
        val dialog=NativeMaterial.dialog(context).setTitle(model.optString("title")).setView(scroll).setPositiveButton(model.optString("saveLabel","保存"),null).setNegativeButton(model.optString("cancelLabel","取消"),null).create()
        dialog.setCanceledOnTouchOutside(false)
        dialog.setCancelable(false)
        dialog.setOnCancelListener {emit(activity,"click",mapOf("key" to model.optString("cancel")))}
        dialog.setOnShowListener {
            NativeNavigation.dialogBack(dialog){emit(activity,"click",mapOf("key" to model.optString("cancel")))}
            NativeMaterial.dialogButtons(dialog)
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {emit(activity,"click",mapOf("key" to model.optString("save")))}
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener {emit(activity,"click",mapOf("key" to model.optString("cancel")))}
        }
        return dialog
    }
    private fun renderNodes(activity:Activity,parent:LinearLayout,nodes:JSONArray,path:String="") {
        val context=parent.context
        for(index in 0 until nodes.length()) {
            val node=nodes.getJSONObject(index);val key=node.optString("key");val label=node.optString("label")
            when(node.optString("type")) {
                "container" -> renderNodes(activity,parent,node.optJSONArray("children") ?: JSONArray(),path)
                "text" -> parent.addView(NativeMaterial.label(context,label).apply {setPadding(0,8,0,8)})
                "group" -> {
                    val groupId=path+"/"+label
                    val opened=groups[groupId] ?: node.optBoolean("expanded")
                    val children=vertical(context).apply {visibility=if(opened)View.VISIBLE else View.GONE};var built=opened
                    if(opened)renderNodes(activity,children,node.optJSONArray("children") ?: JSONArray(),groupId)
                    val button=NativeMaterial.button(context,label+"  ›");button.setOnClickListener {
                        if(!built){renderNodes(activity,children,node.optJSONArray("children") ?: JSONArray(),groupId);built=true}
                        val show=children.visibility!=View.VISIBLE;groups[groupId]=show;children.visibility=if(show)View.VISIBLE else View.GONE
                    };parent.addView(button);parent.addView(children)
                }
                "button" -> parent.addView(NativeMaterial.button(context,label).apply {isEnabled=!node.optBoolean("disabled");setOnClickListener {emit(activity,"click",mapOf("key" to key))}})
                "radio" -> parent.addView(com.google.android.material.radiobutton.MaterialRadioButton(context).apply {
                    text=label;setTextColor(NativeMaterial.text);buttonTintList=android.content.res.ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked),intArrayOf()),intArrayOf(NativeMaterial.primary,NativeMaterial.muted));isChecked=node.optBoolean("checked");isEnabled=!node.optBoolean("disabled")
                    setOnCheckedChangeListener {_,checked->if(checked)emit(activity,"change",mapOf("key" to key,"checked" to true))}
                })
                "checkbox" -> parent.addView(MaterialCheckBox(context).apply {
                    text=label;setTextColor(NativeMaterial.text);buttonTintList=android.content.res.ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked),intArrayOf()),intArrayOf(NativeMaterial.primary,NativeMaterial.muted));isChecked=node.optBoolean("checked");isEnabled=!node.optBoolean("disabled")
                    setOnCheckedChangeListener {_,checked->emit(activity,"change",mapOf("key" to key,"checked" to checked))}
                })
                "select" -> {
                    parent.addView(NativeMaterial.label(context,label));val options=node.optJSONArray("options") ?: JSONArray()
                    val entries=(0 until options.length()).map {options.getJSONObject(it)}
                    val selector=NativeMaterial.button(context,entries.find {it.optString("value")==node.optString("value")}?.optString("label") ?: "")
                    selector.isEnabled=!node.optBoolean("disabled");selector.setOnClickListener {
                        NativeMaterial.dialog(context).setTitle(label).setItems(entries.map {it.optString("label")}.toTypedArray()) {_,which->emit(activity,"change",mapOf("key" to key,"value" to entries[which].optString("value")))}.show()
                    };parent.addView(selector)
                }
                "input" -> {
                    if(node.optString("inputType")=="range") {
                        parent.addView(NativeMaterial.label(context,label))
                        val from=node.optString("min").toFloatOrNull() ?: 0f;val to=node.optString("max").toFloatOrNull()?.coerceAtLeast(from+1f) ?: 100f
                        val slider=com.google.android.material.slider.Slider(context).apply {
                            valueFrom=from;valueTo=to;value=(node.optString("value").toFloatOrNull() ?: from).coerceIn(from,to);isEnabled=!node.optBoolean("disabled")
                            thumbTintList=android.content.res.ColorStateList.valueOf(NativeMaterial.primary)
                            trackActiveTintList=android.content.res.ColorStateList.valueOf(NativeMaterial.primary)
                            addOnChangeListener {_,value,user->if(user)emit(activity,"input",mapOf("key" to key,"value" to value.toString()))}
                        };parent.addView(slider);continue
                    }
                    val input=NativeMaterial.field(parent,node.optString("value"),label,node.optString("inputType")=="textarea")
                    input.isEnabled=!node.optBoolean("disabled")
                    if(node.optString("inputType") in listOf("number","range"))input.inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
                    if(node.optString("inputType")=="password") {
                        input.inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD;input.isSaveEnabled=false
                        if(android.os.Build.VERSION.SDK_INT>=26)input.importantForAutofill=View.IMPORTANT_FOR_AUTOFILL_NO
                    }
                    input.addTextChangedListener(object:TextWatcher {
                        override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
                        override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){emit(activity,"input",mapOf("key" to key,"value" to s.toString()))}
                        override fun afterTextChanged(s:Editable?){}
                    })
                }
            }
        }
    }
    private fun tile(context:Context,id:String,label:String,enabled:Boolean,action:()->Unit):View {
        val box=vertical(context);padding(box,6);box.isEnabled=enabled;box.alpha=if(enabled)1f else .45f
        box.background=NativeMaterial.background(context,NativeMaterial.container,14)
        val icon=NativeMaterial.icon(context,NativeMaterial.glyph(id),label){if(enabled)action()}
        if(id=="delete")icon.setTextColor(NativeMaterial.danger)
        box.addView(icon,LinearLayout.LayoutParams(-1,NativeMaterial.dp(context,32)))
        box.addView(NativeMaterial.label(context,label,12f).apply {gravity=Gravity.CENTER;maxLines=2},LinearLayout.LayoutParams(-1,NativeMaterial.dp(context,32)))
        box.setOnClickListener {if(enabled)action()};return box
    }
    private fun menu(activity:Activity,model:JSONObject):AlertDialog {
        val context=NativeMaterial.context(activity,dark);val grid=GridLayout(context).apply {columnCount=3;padding(this)}
        val content=vertical(context);val header=row(context);padding(header)
        header.addView(NativeMaterial.label(context,model.optString("title"),20f),LinearLayout.LayoutParams(0,-2,1f))
        val scroll=ScrollView(context).apply {addView(grid)}
        content.addView(header);content.addView(scroll)
        val dialog=NativeMaterial.dialog(context).setView(content).create()
        header.addView(NativeMaterial.icon(context,"\ue5cd","关闭"){dialog.dismiss()})
        val items=model.optJSONArray("items") ?: JSONArray()
        for(index in 0 until items.length()) {
            val item=items.getJSONObject(index)
            grid.addView(tile(context,item.optString("id"),item.optString("label"),!item.optBoolean("disabled")) {dialog.dismiss();emit(activity,"click",mapOf("key" to item.optString("key")))},GridLayout.LayoutParams().apply {width=0;columnSpec=GridLayout.spec(GridLayout.UNDEFINED,1f);setMargins(4,4,4,4)})
        }
        dialog.setOnDismissListener {emit(activity,"close-more")};return dialog
    }
}
